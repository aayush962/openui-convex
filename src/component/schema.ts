import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { actionRecordArgs, stateKey, vState } from "../client/validators.js";

export default defineSchema({
  uiState: defineTable({ ...stateKey, state: vState, version: v.number(), updatedAt: v.number() })
    .index("by_scope_message", ["scopeKey", "messageId"]),
  actionEvents: defineTable({ ...actionRecordArgs, createdAt: v.number() })
    .index("by_scope_created", ["scopeKey", "createdAt"]),
});
