import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUIMessages, type UIMessage } from "@convex-dev/agent/react";
import { Renderer } from "@openuidev/react-lang";
import type { ActionEvent } from "@openuidev/lang-core";
import { openuiChatLibrary } from "@openuidev/react-ui/genui-lib";
import { StateSynchronizer } from "openui-convex/react";
import { api } from "../../convex/_generated/api";

const THREAD_STORAGE_KEY = "openui-convex-demo-thread";
const STATE_DEBOUNCE_MS = 400;

type UIState = Record<string, unknown>;
type StateDoc = { messageId: string; state: UIState; version: number };

function loadThreadId(): string | null {
  try { return localStorage.getItem(THREAD_STORAGE_KEY); } catch { return null; }
}
function storeThreadId(threadId: string | null) {
  try {
    if (threadId) localStorage.setItem(THREAD_STORAGE_KEY, threadId);
    else localStorage.removeItem(THREAD_STORAGE_KEY);
  } catch { /* private mode etc. — thread just won't survive reloads */ }
}

function focusWithin(messageId: string): boolean {
  const container = document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
  return !!container && container.contains(document.activeElement);
}

/** Memoized so only the streaming message re-renders on each delta. */
const Message = memo(function Message({ messageId, role, text, status, initialState, onAction, onStateUpdate }: {
  messageId: string;
  role: UIMessage["role"];
  text: string;
  status: UIMessage["status"];
  initialState?: UIState;
  onAction: (messageId: string, event: ActionEvent) => void;
  onStateUpdate: (messageId: string, state: UIState) => void;
}) {
  if (role === "user") return <div className="msg-user">{text}</div>;
  if (!text && status === "pending") return <div className="msg-pending">Thinking…</div>;
  const streaming = status === "streaming";
  return (
    <div className="msg-assistant" data-message-id={messageId}>
      <Renderer
        library={openuiChatLibrary}
        response={text}
        isStreaming={streaming}
        initialState={initialState}
        onAction={event => onAction(messageId, event)}
        // Suppressed while streaming: the model may re-emit $state declarations mid-stream.
        onStateUpdate={streaming ? undefined : state => onStateUpdate(messageId, state)}
        onError={errors => { if (errors.length) console.warn("OpenUI parse errors", errors); }}
      />
    </div>
  );
});

export default function Chat() {
  const [threadId, setThreadId] = useState<string | null>(loadThreadId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const createThread = useMutation(api.chat.createThread);
  const sendMessage = useMutation(api.chat.sendMessage);
  const setUIState = useMutation(api.openui.setState);
  const recordAction = useMutation(api.openui.recordAction);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { results: messages } = useUIMessages(
    api.chat.listMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  // One subscription hydrates persisted UI state for the whole thread.
  const stateDocs = useQuery(api.openui.listState, threadId ? { scopeKey: threadId } : "skip");

  // messageId -> doc, keeping the previous object identity while the version is
  // unchanged so an unrelated write doesn't re-render every message.
  const docsRef = useRef(new Map<string, StateDoc>());
  const remoteState = useMemo(() => {
    const next = new Map<string, StateDoc>();
    for (const doc of stateDocs ?? []) {
      const prev = docsRef.current.get(doc.messageId);
      next.set(doc.messageId, prev && prev.version === doc.version ? prev : doc);
    }
    docsRef.current = next;
    return next;
  }, [stateDocs]);

  // Per-message debounced write synchronizers; they outlive Message mounts.
  const syncsRef = useRef(new Map<string, StateSynchronizer>());
  // Bumped when a remote version should remount a message with fresh initialState.
  const [remountVersions, setRemountVersions] = useState<Record<string, number>>({});
  useEffect(() => {
    syncsRef.current = new Map();
    setRemountVersions({});
  }, [threadId]);

  const reportState = useCallback((messageId: string, state: UIState) => {
    if (!threadId) return;
    let sync = syncsRef.current.get(messageId);
    if (!sync) {
      const doc = docsRef.current.get(messageId);
      sync = new StateSynchronizer({
        delay: STATE_DEBOUNCE_MS,
        initialState: doc?.state,
        initialVersion: doc?.version,
        save: (nextState, clientVersion) => setUIState({ scopeKey: threadId, messageId, state: nextState, clientVersion }),
        onError: error => console.warn("openui: failed to persist UI state", error),
      });
      syncsRef.current.set(messageId, sync);
    }
    sync.report(state);
  }, [threadId, setUIState]);

  // Multi-window sync: when a version arrives that this window didn't write and
  // the user isn't editing that message, remount it so initialState re-hydrates.
  useEffect(() => {
    if (!stateDocs) return;
    const bumps: Record<string, number> = {};
    for (const doc of stateDocs) {
      const sync = syncsRef.current.get(doc.messageId);
      const lastLocal = sync?.version ?? 0;
      if (doc.version > lastLocal && !focusWithin(doc.messageId)) bumps[doc.messageId] = doc.version;
      sync?.accept(doc.state, doc.version);
    }
    setRemountVersions(prev =>
      Object.entries(bumps).some(([id, version]) => prev[id] !== version) ? { ...prev, ...bumps } : prev);
  }, [stateDocs]);

  /** Default pipeline for OpenUI action events (guide §9.2): record for audit,
   * then continue_conversation posts a follow-up message; open_url opens a tab. */
  const handleAction = useCallback((messageId: string, e: ActionEvent) => {
    if (threadId) {
      recordAction({
        scopeKey: threadId, messageId, type: e.type, params: e.params,
        ...(e.formName !== undefined ? { formName: e.formName } : {}),
        ...(e.formState !== undefined ? { formState: e.formState } : {}),
        ...(e.humanFriendlyMessage ? { humanFriendlyMessage: e.humanFriendlyMessage } : {}),
      }).catch(error => console.warn("openui: failed to record action", error));
    }
    if (e.type === "open_url") {
      const url = typeof e.params.url === "string" ? e.params.url : undefined;
      if (url && /^https?:\/\//.test(url)) window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    if (e.type === "continue_conversation") {
      const message = e.humanFriendlyMessage
        || (typeof e.params.message === "string" ? e.params.message : "");
      if (message && threadId) {
        void sendMessage({ threadId, prompt: message });
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
      }
      return;
    }
    console.warn("Unhandled OpenUI action", e);
  }, [threadId, sendMessage, recordAction]);

  const send = useCallback(async () => {
    const prompt = draft.trim();
    if (!prompt || sending) return;
    setSending(true);
    try {
      let id = threadId;
      if (!id) {
        id = await createThread({});
        storeThreadId(id);
        setThreadId(id);
      }
      await sendMessage({ threadId: id, prompt });
      setDraft("");
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    } finally {
      setSending(false);
    }
  }, [draft, sending, threadId, createThread, sendMessage]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>OpenUI × Convex</h1>
        <button onClick={() => { storeThreadId(null); setThreadId(null); }}>New thread</button>
      </header>
      <main className="messages">
        {!threadId || messages.length === 0 ? (
          <div className="empty">
            Ask for an interface, not just an answer.<br />
            Try “Show a bar chart comparing revenue Jan–Jun” or “Give me a contact form”.
          </div>
        ) : (
          messages.map(m => (
            <Message
              key={`${m.key}:${remountVersions[m.key] ?? 0}`}
              messageId={m.key}
              role={m.role}
              text={m.text}
              status={m.status}
              initialState={remoteState.get(m.key)?.state}
              onAction={handleAction}
              onStateUpdate={reportState}
            />
          ))
        )}
        <div ref={bottomRef} />
      </main>
      <form className="composer" onSubmit={e => { e.preventDefault(); void send(); }}>
        <textarea
          rows={2}
          value={draft}
          placeholder="Describe the UI you want…"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
        />
        <button type="submit" disabled={!draft.trim() || sending}>Send</button>
      </form>
    </div>
  );
}
