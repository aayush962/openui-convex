import { describe, expect, test } from "vitest";
import { decodeState, encodeState } from "openui-convex";
import { api } from "./_generated/api";
import { initConvexTest } from "./setup.test";

describe("example app", () => {
  test("interface state is scoped to a thread and guarded by thread access", async () => {
    const t = initConvexTest();
    const threadId = await t.mutation(api.chat.createThread, {});
    await expect(t.query(api.openui.getState, { scopeKey: "no-such-thread", messageId: "m" })).rejects.toThrow();
    expect(await t.query(api.openui.getState, { scopeKey: threadId, messageId: "m" })).toBeNull();

    // Browsers send the wire encoding; the hook does this automatically.
    const state = encodeState({ $name: "Ada", contact: { $email: "ada@example.com" } });
    expect(await t.mutation(api.openui.setState, { scopeKey: threadId, messageId: "m", state })).toEqual({ version: 1 });
    const saved = await t.query(api.openui.getState, { scopeKey: threadId, messageId: "m" });
    expect(decodeState(saved!.state)).toEqual({ $name: "Ada", contact: { $email: "ada@example.com" } });

    // Another thread neither sees nor deletes the first thread's interfaces.
    const other = await t.mutation(api.chat.createThread, {});
    expect(await t.query(api.openui.getState, { scopeKey: other, messageId: "m" })).toBeNull();
    expect(await t.mutation(api.openui.clearState, { scopeKey: other })).toEqual({ deleted: 0, hasMore: false });
    expect(await t.mutation(api.openui.clearState, { scopeKey: threadId })).toEqual({ deleted: 1, hasMore: false });
    expect(await t.query(api.openui.getState, { scopeKey: threadId, messageId: "m" })).toBeNull();
  });
});
