/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { convexToJson } from "convex/values";
import schema from "./schema.js";
import { api } from "./_generated/api.js";
import { decodeState, encodeState } from "../client/serialization.js";
const modules = import.meta.glob("./**/*.ts");

describe("component state", () => {
  test("$bindings survive the Convex wire boundary and storage", async () => {
    expect(() => convexToJson({ $name: "Ada" })).toThrow();
    const state = encodeState({ $name: "Ada", contact: { $email: "ada@example.com" } });
    expect(() => convexToJson(state)).not.toThrow();
    const t = convexTest(schema, modules);
    expect(await t.mutation(api.state.set, { scopeKey: "a", messageId: "m", state })).toEqual({ version: 1 });
    const result = await t.query(api.state.get, { scopeKey: "a", messageId: "m" });
    expect(decodeState(result!.state)).toEqual({ $name: "Ada", contact: { $email: "ada@example.com" } });
  });
  test("last write wins and versions only increase", async () => {
    const t = convexTest(schema, modules);
    expect(await t.mutation(api.state.set, { scopeKey: "a", messageId: "m", state: { text: "one" } })).toEqual({ version: 1 });
    expect(await t.mutation(api.state.set, { scopeKey: "a", messageId: "m", state: { text: "two" } })).toEqual({ version: 2 });
    expect(await t.query(api.state.get, { scopeKey: "a", messageId: "m" })).toMatchObject({ state: { text: "two" }, version: 2 });
    expect(await t.query(api.state.get, { scopeKey: "b", messageId: "m" })).toBeNull();
  });
  test("a record recreated after a clear restarts its version under a new instanceId", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.state.set, { scopeKey: "a", messageId: "m", state: { text: "one" } });
    const first = await t.query(api.state.get, { scopeKey: "a", messageId: "m" });
    await t.mutation(api.state.clear, { scopeKey: "a", messageId: "m" });
    await t.mutation(api.state.set, { scopeKey: "a", messageId: "m", state: { text: "again" } });
    const second = await t.query(api.state.get, { scopeKey: "a", messageId: "m" });
    expect(second).toMatchObject({ version: 1 });
    expect(second!.instanceId).not.toBe(first!.instanceId);
  });
  test("rejects malformed and oversized state before storing it", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.state.set, { scopeKey: "a", messageId: "m", state: { openuiEncoding: "json-v1", data: "not json" } })).rejects.toThrow();
    await expect(t.mutation(api.state.set, { scopeKey: "a", messageId: "m", state: encodeState({ text: "x".repeat(65_536) }) })).rejects.toThrow("64 KiB");
    expect(await t.query(api.state.get, { scopeKey: "a", messageId: "m" })).toBeNull();
  });
  test("clear respects message and scope boundaries and deletes in batches of 100", async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < 102; i++) await t.mutation(api.state.set, { scopeKey: "a", messageId: `m${i}`, state: {} });
    await t.mutation(api.state.set, { scopeKey: "b", messageId: "m0", state: {} });
    expect(await t.mutation(api.state.clear, { scopeKey: "a", messageId: "m0" })).toEqual({ deleted: 1, hasMore: false });
    expect(await t.query(api.state.get, { scopeKey: "a", messageId: "m0" })).toBeNull();
    expect(await t.query(api.state.get, { scopeKey: "a", messageId: "m1" })).not.toBeNull();
    expect(await t.mutation(api.state.clear, { scopeKey: "a" })).toEqual({ deleted: 100, hasMore: true });
    expect(await t.mutation(api.state.clear, { scopeKey: "a" })).toEqual({ deleted: 1, hasMore: false });
    expect(await t.query(api.state.get, { scopeKey: "a", messageId: "m101" })).toBeNull();
    expect(await t.query(api.state.get, { scopeKey: "b", messageId: "m0" })).not.toBeNull();
  });
});
