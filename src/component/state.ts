import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { stateKey, stateSetArgs, stateClearArgs, vStateDoc } from "../client/validators.js";
import { decodeState, serializeJson } from "../client/serialization.js";

export const get = query({
  args: stateKey,
  returns: v.union(v.null(), vStateDoc),
  handler: async (ctx, { scopeKey, messageId }) => {
    const row = await ctx.db.query("uiState").withIndex("by_scope_message", q => q.eq("scopeKey", scopeKey).eq("messageId", messageId)).unique();
    return row ? { state: row.state, version: row.version, instanceId: row._id } : null;
  },
});
export const set = mutation({
  args: stateSetArgs, returns: v.object({ version: v.number() }),
  handler: async (ctx, { scopeKey, messageId, state }) => {
    // Reject malformed envelopes before they can break every subscribing renderer.
    const json = serializeJson(decodeState(state));
    if (new TextEncoder().encode(json).byteLength > 65_536) throw new Error("OpenUI state exceeds the 64 KiB limit");
    const existing = await ctx.db.query("uiState").withIndex("by_scope_message", q => q.eq("scopeKey", scopeKey).eq("messageId", messageId)).unique();
    const version = (existing?.version ?? 0) + 1;
    const value = { scopeKey, messageId, state, version, updatedAt: Date.now() };
    if (existing) await ctx.db.replace(existing._id, value);
    else await ctx.db.insert("uiState", value);
    return { version };
  },
});
export const clear = mutation({
  args: stateClearArgs, returns: v.object({ deleted: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, { scopeKey, messageId }) => {
    const rows = await ctx.db.query("uiState").withIndex("by_scope_message", q => {
      const scope = q.eq("scopeKey", scopeKey);
      return messageId === undefined ? scope : scope.eq("messageId", messageId);
    }).take(101);
    for (const row of rows.slice(0, 100)) await ctx.db.delete(row._id);
    return { deleted: Math.min(rows.length, 100), hasMore: rows.length > 100 };
  },
});
