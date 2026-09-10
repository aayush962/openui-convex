import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { stateKey, stateSetArgs, stateClearArgs, vState, vStateDoc } from "../client/validators.js";

export const get = query({
  args: stateKey,
  returns: v.union(v.null(), v.object({ state: vState, version: v.number() })),
  handler: async (ctx, { scopeKey, messageId }) => {
    const row = await ctx.db.query("uiState").withIndex("by_scope_message", q => q.eq("scopeKey", scopeKey).eq("messageId", messageId)).unique();
    return row ? { state: row.state, version: row.version } : null;
  },
});
export const listByScope = query({
  args: { scopeKey: v.string() }, returns: v.array(vStateDoc),
  handler: async (ctx, { scopeKey }) => (await ctx.db.query("uiState").withIndex("by_scope_message", q => q.eq("scopeKey", scopeKey)).collect())
    .map(({ messageId, state, version }) => ({ messageId, state, version })),
});
export const set = mutation({
  args: stateSetArgs, returns: v.object({ version: v.number() }),
  handler: async (ctx, { scopeKey, messageId, state }) => {
    const existing = await ctx.db.query("uiState").withIndex("by_scope_message", q => q.eq("scopeKey", scopeKey).eq("messageId", messageId)).unique();
    const version = (existing?.version ?? 0) + 1;
    const value = { scopeKey, messageId, state, version, updatedAt: Date.now() };
    if (existing) await ctx.db.replace(existing._id, value);
    else await ctx.db.insert("uiState", value);
    return { version };
  },
});
export const clear = mutation({
  args: stateClearArgs, returns: v.null(),
  handler: async (ctx, { scopeKey, messageId }) => {
    const rows = await ctx.db.query("uiState").withIndex("by_scope_message", q => {
      const scope = q.eq("scopeKey", scopeKey);
      return messageId === undefined ? scope : scope.eq("messageId", messageId);
    }).collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return null;
  },
});
