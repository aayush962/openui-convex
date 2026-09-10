import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { paginator } from "convex-helpers/server/pagination";
import { mutation, query } from "./_generated/server.js";
import { actionRecordArgs, vActionPage } from "../client/validators.js";
import schema from "./schema.js";

export const record = mutation({
  args: actionRecordArgs, returns: v.string(),
  handler: (ctx, args) => ctx.db.insert("actionEvents", { ...args, createdAt: Date.now() }),
});
export const list = query({
  args: { scopeKey: v.string(), paginationOpts: paginationOptsValidator }, returns: vActionPage,
  handler: (ctx, { scopeKey, paginationOpts }) => paginator(ctx.db, schema)
    .query("actionEvents").withIndex("by_scope_created", q => q.eq("scopeKey", scopeKey))
    .order("desc").paginate(paginationOpts),
});
