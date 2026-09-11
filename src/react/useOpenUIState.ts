import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import type { OpenUIApi, UIState } from "../client/index.js";
import { encodeState } from "../client/serialization.js";
import { InterfaceSession, LOADING_VIEW, type SessionView } from "./session.js";

export type UseOpenUIStateOptions = {
  /** Your app's wrappers from `openui.api(...)`, for example `api.openui`. */
  api: Pick<OpenUIApi, "getState" | "setState">;
  /** Opaque group of interfaces: a thread, document, or dashboard. Authorization and bulk cleanup use it. */
  scopeKey: string;
  /** Opaque id of one interface inside the scope, typically the assistant message id. */
  messageId: string;
  /** While true, edits are not persisted: the renderer's state is incomplete during generation. */
  isStreaming?: boolean;
  /** Trailing debounce for writes. Default 400 ms. */
  debounceMs?: number;
  /** Receives failed writes and invalid state values. Nothing is thrown into React. */
  onError?: (error: unknown) => void;
};

/**
 * Persists one OpenUI Renderer's state in Convex and keeps it in sync across clients.
 *
 * Wire the result into your own Renderer once `isLoading` is false:
 * spread `containerProps` onto an element around it, then pass `key`, `initialState`, and `onStateUpdate` to it.
 */
export function useOpenUIState({ api, scopeKey, messageId, isStreaming = false, debounceMs = 400, onError }: UseOpenUIStateOptions) {
  const remote = useQuery(api.getState, { scopeKey, messageId });
  const save = useMutation(api.setState);
  const identity = JSON.stringify([scopeKey, messageId, getFunctionName(api.getState), getFunctionName(api.setState)]);

  const session = useRef<InterfaceSession | null>(null);
  const element = useRef<HTMLElement | null>(null);
  const listener = useRef<(() => void) | null>(null);
  const latest = useRef({ save, onError });
  useEffect(() => { latest.current = { save, onError }; });

  const subscribe = useCallback((notify: () => void) => {
    listener.current = notify;
    return () => { listener.current = null; };
  }, []);
  // A session for another interface never leaks its view into this one, not even for one render.
  const getSnapshot = useCallback((): SessionView => {
    const current = session.current;
    return current && current.identity === identity ? current.view : LOADING_VIEW;
  }, [identity]);
  const view = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const isFocused = useCallback(() => element.current?.contains(document.activeElement) ?? false, []);
  useEffect(() => {
    const created = new InterfaceSession(identity, {
      delay: debounceMs,
      // Capture this scope: a flush after a scope change must not write into the next one.
      save: state => latest.current.save({ scopeKey, messageId, state: encodeState(state) }),
      onError: error => latest.current.onError?.(error),
      isFocused,
      onChange: () => listener.current?.(),
    });
    session.current = created;
    const flush = () => { void created.flush(); };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      void created.dispose();
      if (session.current === created) session.current = null;
    };
  }, [identity, scopeKey, messageId, debounceMs, isFocused]);

  useEffect(() => {
    if (remote !== undefined) session.current?.receive(remote);
  }, [remote, identity]);

  // Deferred remote updates may apply once focus leaves the interface.
  const onFocusOut = useCallback(() => {
    queueMicrotask(() => session.current?.recheck());
  }, []);
  const container = useCallback((node: HTMLElement | null) => {
    element.current?.removeEventListener("focusout", onFocusOut);
    element.current = node;
    node?.addEventListener("focusout", onFocusOut);
  }, [onFocusOut]);
  // Spread rather than passed as `ref`: the React Compiler treats an object whose property feeds a ref prop as a ref.
  const containerProps = useMemo(() => ({ ref: container }), [container]);

  const report = useCallback((state: UIState) => {
    try { session.current?.report(state); } catch (error) { latest.current.onError?.(error); }
  }, []);
  const flush = useCallback(() => session.current?.flush() ?? Promise.resolve(), []);

  return {
    /** True until the persisted snapshot, or its absence, is known. Mount the Renderer after that. */
    isLoading: !view.ready || remote === undefined,
    /** Changes when a remote snapshot replaces local state; the remount also clears fields the snapshot no longer has. */
    key: `${identity}:${view.revision}`,
    initialState: view.state,
    /** Spread onto the element around the Renderer. Remote updates wait until focus leaves it. */
    containerProps,
    onStateUpdate: isStreaming || !view.ready ? undefined : report,
    /** Writes pending edits now. Await it before app-controlled navigation. Failures go to onError. */
    flush,
  };
}
