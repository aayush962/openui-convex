import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import type { OpenUIApi, StateDoc, UIState } from "../client/index.js";
import { decodeState, encodeState } from "../client/serialization.js";
import { StateSynchronizer, stateFingerprint } from "./stateSync.js";

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
 * `ref={containerRef}` on an element around it, then `key`, `initialState`, and `onStateUpdate` on it.
 */
export function useOpenUIState({ api, scopeKey, messageId, isStreaming = false, debounceMs = 400, onError }: UseOpenUIStateOptions) {
  const remote = useQuery(api.getState, { scopeKey, messageId });
  const save = useMutation(api.setState);
  const container = useRef<HTMLElement | null>(null);
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  const [tick, refresh] = useReducer((n: number) => n + 1, 0);
  const identity = JSON.stringify([scopeKey, messageId, getFunctionName(api.getState), getFunctionName(api.setState)]);
  function createSession() {
    const initialState = remote ? decodeState(remote.state) : undefined;
    const session = {
      identity, ready: remote !== undefined, active: false,
      hadRemote: remote != null, instanceId: remote?.instanceId,
      view: { state: initialState, revision: 0 },
      sync: new StateSynchronizer({
        delay: debounceMs, initialState, initialVersion: remote?.version,
        // Capture this scope, so unmount/scope-change flushes cannot write into the next one.
        save: state => save({ scopeKey, messageId, state: encodeState(state) }),
        onError: error => errorHandler.current?.(error),
        onSettled: () => { if (session.active) refresh(); },
      }),
    };
    return session;
  }
  const [session, setSession] = useState(createSession);
  // Reset synchronously before rendering a different interface (including its defaults).
  if (session.identity !== identity) setSession(createSession());
  const current = useRef(session);
  current.current = session;

  // Deferred remote updates may apply once focus leaves the interface.
  const onFocusOut = useCallback(() => {
    queueMicrotask(() => { if (current.current.active) refresh(); });
  }, []);
  const containerRef = useCallback((element: HTMLElement | null) => {
    container.current?.removeEventListener("focusout", onFocusOut);
    container.current = element;
    element?.addEventListener("focusout", onFocusOut);
  }, [onFocusOut]);

  useEffect(() => {
    session.active = true;
    const flush = () => { void session.sync.flush(); };
    window.addEventListener("pagehide", flush);
    return () => {
      session.active = false;
      window.removeEventListener("pagehide", flush);
      void session.sync.flush();
    };
  }, [session]);

  useEffect(() => {
    if (remote === undefined) return;
    const apply = (row: StateDoc | null) => {
      const state = row ? decodeState(row.state) : {};
      const different = stateFingerprint(state) !== session.sync.fingerprint;
      session.sync.accept(state, row?.version ?? 0);
      session.hadRemote = row !== null;
      session.instanceId = row?.instanceId;
      if (different || !session.ready) {
        session.view = { state, revision: session.view.revision + 1 };
        session.ready = true;
        refresh();
      }
    };
    if (!session.ready) { apply(remote); return; }
    // Never replace what the user is editing or what is still being written.
    if (session.sync.busy || container.current?.contains(document.activeElement)) return;
    const recreated = remote !== null && remote.instanceId !== session.instanceId;
    if (remote && remote.version < session.sync.version && !recreated) return;
    if (!remote && !session.hadRemote) return;
    apply(remote);
  }, [remote, session, tick]);

  const report = useCallback((state: UIState) => {
    try { session.sync.report(state); } catch (error) { errorHandler.current?.(error); }
  }, [session]);

  return {
    /** True until the persisted snapshot, or its absence, is known. Mount the Renderer after that. */
    isLoading: !session.ready || remote === undefined,
    /** Changes when a remote snapshot replaces local state; the remount also clears fields the snapshot no longer has. */
    key: `${identity}:${session.view.revision}`,
    initialState: session.view.state,
    /** Attach to an element around the Renderer. Remote updates wait until focus leaves it. */
    containerRef,
    onStateUpdate: isStreaming || !session.ready ? undefined : report,
    /** Writes pending edits now. Await it before app-controlled navigation. Failures go to onError. */
    flush: () => session.sync.flush(),
  };
}
