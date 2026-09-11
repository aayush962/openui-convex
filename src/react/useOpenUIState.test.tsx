// @vitest-environment jsdom
import { StrictMode, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { OpenUIApi } from "../client/index.js";
import { decodeState, encodeState } from "../client/serialization.js";
import { useOpenUIState } from "./useOpenUIState.js";

const mocks = vi.hoisted(() => ({
  row: undefined as { state: Record<string, unknown>; version: number; instanceId: string } | null | undefined,
  save: vi.fn(),
  error: vi.fn(),
}));
vi.mock("convex/react", () => ({ useQuery: () => mocks.row, useMutation: () => mocks.save }));

const api = {
  getState: makeFunctionReference<"query">("openui:getState"),
  setState: makeFunctionReference<"mutation">("openui:setState"),
} as unknown as Pick<OpenUIApi, "getState" | "setState">;

/** Stands in for the OpenUI Renderer: hydrates from initialState once and reports every edit. */
function FakeRenderer({ initialState, onStateUpdate }: {
  initialState?: Record<string, unknown>;
  onStateUpdate?: (state: Record<string, unknown>) => void;
}) {
  const [value, setValue] = useState(String(initialState?.$name ?? ""));
  return <input aria-label="Name" value={value} onChange={event => {
    setValue(event.target.value);
    onStateUpdate?.({ $name: event.target.value });
  }} />;
}
function Example({ scope = "thread", streaming = false }: { scope?: string; streaming?: boolean }) {
  const ui = useOpenUIState({ api, scopeKey: scope, messageId: "m", isStreaming: streaming, onError: mocks.error });
  if (ui.isLoading) return null;
  return <div {...ui.containerProps}>
    <FakeRenderer key={ui.key} initialState={ui.initialState} onStateUpdate={ui.onStateUpdate} />
  </div>;
}
function Harness(props: { scope?: string; streaming?: boolean }) {
  return <StrictMode><Example {...props} /></StrictMode>;
}
function remote(name: string, version: number, instanceId = "record-1") {
  mocks.row = { state: encodeState({ $name: name }), version, instanceId };
}
const input = () => screen.getByRole("textbox") as HTMLInputElement;

beforeEach(() => {
  vi.useFakeTimers();
  mocks.row = undefined;
  mocks.save.mockReset().mockResolvedValue({ version: 2 });
  mocks.error.mockReset();
});
afterEach(async () => {
  cleanup();
  await act(async () => { await Promise.resolve(); });
  vi.useRealTimers();
});

test("waits for hydration and never persists default values on mount", () => {
  const view = render(<Harness />);
  expect(screen.queryByRole("textbox")).toBeNull();
  remote("Ada", 1);
  view.rerender(<Harness />);
  expect(input().value).toBe("Ada");
  expect(mocks.save).not.toHaveBeenCalled();
});

test("keeps focus and local edits across echoes; applies remote changes after blur", async () => {
  remote("Ada", 1);
  const view = render(<Harness />);
  const field = input();
  field.focus();
  fireEvent.change(field, { target: { value: "Grace" } });
  remote("Other", 2);
  view.rerender(<Harness />);
  expect(field.value).toBe("Grace");
  expect(document.activeElement).toBe(field);
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.save.mock.calls[0][0]).toMatchObject({ scopeKey: "thread", messageId: "m" });
  expect(decodeState(mocks.save.mock.calls[0][0].state)).toEqual({ $name: "Grace" });
  // The echo of our own write must not remount the renderer.
  remote("Grace", 2);
  view.rerender(<Harness />);
  expect(screen.getByRole("textbox")).toBe(field);
  remote("Remote winner", 3);
  view.rerender(<Harness />);
  expect(field.value).toBe("Grace");
  await act(async () => { field.blur(); await Promise.resolve(); });
  expect(input().value).toBe("Remote winner");
  expect(mocks.save).toHaveBeenCalledTimes(1);
});

test("flushes pending edits to the old scope when the scope changes", async () => {
  remote("Ada", 1);
  const view = render(<Harness />);
  fireEvent.change(input(), { target: { value: "Saved before switch" } });
  remote("New thread", 1);
  await act(async () => { view.rerender(<Harness scope="other" />); });
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ scopeKey: "thread" }));
  expect(input().value).toBe("New thread");
});

test("suppresses persistence while streaming", async () => {
  remote("Ada", 1);
  render(<Harness streaming />);
  fireEvent.change(input(), { target: { value: "Streaming value" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(mocks.save).not.toHaveBeenCalled();
});

test("reports failed writes through onError and retries the same value later", async () => {
  remote("Ada", 1);
  mocks.save.mockRejectedValueOnce(new Error("offline"));
  render(<Harness />);
  fireEvent.change(input(), { target: { value: "Grace" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  expect(mocks.error).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: "offline" }));
  fireEvent.change(input(), { target: { value: "Grac" } });
  fireEvent.change(input(), { target: { value: "Grace" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  expect(mocks.save).toHaveBeenCalledTimes(2);
});

test("clears the renderer when the persisted record is removed", () => {
  remote("Ada", 1);
  const view = render(<Harness />);
  mocks.row = null;
  view.rerender(<Harness />);
  expect(input().value).toBe("");
});

test("accepts a recreated record whose version restarts after a clear", () => {
  remote("Old record", 8);
  const view = render(<Harness />);
  // A client can miss the intermediate empty snapshot between clear and set.
  remote("Recreated record", 1, "record-2");
  view.rerender(<Harness />);
  expect(input().value).toBe("Recreated record");
});
