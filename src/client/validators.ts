import { v, type Infer } from "convex/values";

export const vState = v.record(v.string(), v.any());
export const vStateDoc = v.object({ state: vState, version: v.number(), instanceId: v.string() });
export const stateKey = { scopeKey: v.string(), messageId: v.string() };
export const stateSetArgs = { ...stateKey, state: vState };
export const stateClearArgs = { scopeKey: v.string(), messageId: v.optional(v.string()) };
export type UIState = Record<string, unknown>;
export type StateDoc = Infer<typeof vStateDoc>;
