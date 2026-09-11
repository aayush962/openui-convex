import { useCallback, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useUIMessages, type UIMessage } from "@convex-dev/agent/react";
import { Renderer, type ActionEvent } from "@openuidev/react-lang";
import { openuiChatLibrary } from "@openuidev/react-ui/genui-lib";
import { useOpenUIState } from "openui-convex/react";
import { api } from "../../convex/_generated/api";

const THREAD_STORAGE_KEY = "openui-convex-demo-thread";
function loadThreadId(): string | null {
  try { return localStorage.getItem(THREAD_STORAGE_KEY); } catch { return null; }
}
function storeThreadId(threadId: string | null) {
  try {
    if (threadId) localStorage.setItem(THREAD_STORAGE_KEY, threadId);
    else localStorage.removeItem(THREAD_STORAGE_KEY);
  } catch { /* Storage can be unavailable in private browsing. */ }
}

/** One generated interface. The component persists its state; the app renders it and handles actions. */
function AssistantMessage({ threadId, message, onAction }: {
  threadId: string;
  message: UIMessage;
  onAction: (event: ActionEvent) => void;
}) {
  const streaming = message.status === "streaming";
  const ui = useOpenUIState({
    api: api.openui, scopeKey: threadId, messageId: message.key, isStreaming: streaming,
    onError: error => console.warn("openui-convex: could not save interface state", error),
  });
  if (!message.text) {
    if (message.status === "failed") return <div className="msg-pending">Generation failed.</div>;
    if (message.status === "pending") return <div className="msg-pending">Thinking…</div>;
  }
  if (ui.isLoading) return null;
  return <div className="msg-assistant" {...ui.containerProps}>
    <Renderer
      key={ui.key}
      library={openuiChatLibrary}
      response={message.text}
      isStreaming={streaming}
      initialState={ui.initialState}
      onStateUpdate={ui.onStateUpdate}
      onAction={onAction}
      onError={errors => { if (errors.length) console.warn("OpenUI errors", errors); }}
    />
  </div>;
}

export default function Chat() {
  const [threadId, setThreadId] = useState<string | null>(loadThreadId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const createThread = useMutation(api.chat.createThread);
  const sendMessage = useMutation(api.chat.sendMessage);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { results: messages, status, loadMore } = useUIMessages(
    api.chat.listMessages, threadId ? { threadId } : "skip",
    { initialNumItems: 20, stream: true },
  );
  const showError = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
  }, []);

  /** App policy for interface actions: follow-ups go back to the agent, links open in a new tab. */
  const handleAction = useCallback((event: ActionEvent) => {
    if (event.type === "open_url") {
      const url = typeof event.params.url === "string" ? event.params.url : "";
      if (/^https?:\/\//.test(url)) window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    if (event.type === "continue_conversation" && threadId && event.humanFriendlyMessage) {
      // The model needs the submitted values too, not only the button label.
      const context = { context: event.params.context, formState: event.formState };
      const details = context.context || context.formState ? `\n\nInterface context: ${JSON.stringify(context)}` : "";
      sendMessage({ threadId, prompt: event.humanFriendlyMessage + details }).catch(showError);
    }
  }, [threadId, sendMessage, showError]);

  const send = useCallback(async () => {
    const prompt = draft.trim();
    if (!prompt || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      let id = threadId;
      if (!id) {
        id = await createThread({});
        storeThreadId(id);
        setThreadId(id);
      }
      await sendMessage({ threadId: id, prompt });
      // Preserve text entered while this request was pending.
      setDraft(current => current.trim() === prompt ? "" : current);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (cause) { showError(cause); }
    finally { sendingRef.current = false; setSending(false); }
  }, [draft, threadId, createThread, sendMessage, showError]);

  return <div className="app">
    <header className="app-header">
      <h1>OpenUI × Convex</h1>
      <button disabled={sending} onClick={() => { storeThreadId(null); setThreadId(null); setError(null); }}>New thread</button>
    </header>
    <main className="messages">
      {status === "CanLoadMore" && <button onClick={() => loadMore(20)}>Load earlier messages</button>}
      {threadId && status === "LoadingFirstPage" && <div role="status">Loading conversation…</div>}
      {!threadId || (status !== "LoadingFirstPage" && messages.length === 0) ? <div className="empty">
        Ask for an interface, not just an answer.<br />
        Try “Give me a contact form” — then edit it, reload, or open a second window.
      </div> : messages.map(message => message.role === "user"
        ? <div className="msg-user" key={message.key}>{message.text}</div>
        : message.role === "assistant"
          ? <AssistantMessage key={message.key} threadId={threadId} message={message} onAction={handleAction} />
          : null)}
      <div ref={bottomRef} />
    </main>
    {error && <div className="app-error" role="alert">{error}</div>}
    <form className="composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      <textarea rows={2} aria-label="Describe the interface" value={draft} placeholder="Describe the UI you want…"
        onChange={event => setDraft(event.target.value)} onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault(); void send();
          }
        }} />
      <button type="submit" disabled={!draft.trim() || sending}>Send</button>
    </form>
  </div>;
}
