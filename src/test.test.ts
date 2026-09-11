/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { componentsGeneric, defineSchema, makeFunctionReference } from "convex/server";
import { expect, test } from "vitest";
import { register } from "./test.js";
import { OpenUI } from "./client/index.js";
import type { ComponentApi } from "./component/_generated/component.js";

test("register helper supports server helpers and app wrappers with authorization hooks", async () => {
  const components = componentsGeneric() as unknown as { openui: ComponentApi };
  const openui = new OpenUI(components.openui);
  const appApi = openui.api({
    checkRead: (_ctx, scope) => { if (scope !== "allowed") throw new Error("Forbidden"); },
    checkWrite: (_ctx, scope) => { if (scope !== "allowed") throw new Error("Forbidden"); },
  });
  const modules = { ...import.meta.glob("./component/_generated/*.ts"), "./component/testApp.ts": () => Promise.resolve(appApi) };
  const t = convexTest(defineSchema({}), modules);
  register(t);

  await t.run(ctx => openui.setState(ctx, { scopeKey: "allowed", messageId: "m", state: { $name: "Ada" } }));
  await t.run(async ctx => {
    const result = await openui.getState(ctx, { scopeKey: "allowed", messageId: "m" });
    expect(result?.state).toEqual({ $name: "Ada" });
  });

  const getState = makeFunctionReference<"query">("testApp:getState");
  const setState = makeFunctionReference<"mutation">("testApp:setState");
  const clearState = makeFunctionReference<"mutation">("testApp:clearState");
  await expect(t.query(getState, { scopeKey: "forbidden", messageId: "m" })).rejects.toThrow("Forbidden");
  await expect(t.mutation(setState, { scopeKey: "forbidden", messageId: "m", state: {} })).rejects.toThrow("Forbidden");
  await expect(t.mutation(clearState, { scopeKey: "forbidden" })).rejects.toThrow("Forbidden");
  expect(await t.query(getState, { scopeKey: "allowed", messageId: "m" })).toMatchObject({ version: 1 });
  expect(await t.mutation(clearState, { scopeKey: "allowed" })).toEqual({ deleted: 1, hasMore: false });
  expect(await t.query(getState, { scopeKey: "allowed", messageId: "m" })).toBeNull();
});
