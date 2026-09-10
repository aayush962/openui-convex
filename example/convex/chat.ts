import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { listUIMessages, vStreamArgs } from "@convex-dev/agent";
import { components, internal } from "./_generated/api";
import { internalAction, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { uiAgent } from "./agents";
import { systemPrompt } from "./prompt";

/** Demo app: no auth — every client may access every thread. */
export async function authorizeThreadAccess(_ctx: QueryCtx | MutationCtx, _threadId: string) {}

export const createThread = mutation({
  args: {},
  returns: v.string(),
  handler: async ctx => {
    const { threadId } = await uiAgent.createThread(ctx, {});
    return threadId;
  },
});

export const sendMessage = mutation({
  args: { threadId: v.string(), prompt: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId, prompt }) => {
    await authorizeThreadAccess(ctx, threadId);
    const { messageId } = await uiAgent.saveMessage(ctx, { threadId, prompt, skipEmbeddings: true });
    await ctx.scheduler.runAfter(0, internal.chat.generate, { threadId, promptMessageId: messageId });
    return null;
  },
});

export const generate = internalAction({
  args: { threadId: v.string(), promptMessageId: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId, promptMessageId }) => {
    await uiAgent.streamText(
      ctx,
      { threadId },
      { promptMessageId, system: systemPrompt() },
      // "line" chunking: OpenUI Lang is one statement per line, so the client
      // mostly re-parses whole statements — fewer partial-prop flickers.
      { saveStreamDeltas: { chunking: "line", throttleMs: 250 } },
    );
    return null;
  },
});

export const listMessages = query({
  args: { threadId: v.string(), paginationOpts: paginationOptsValidator, streamArgs: vStreamArgs },
  handler: async (ctx, { threadId, paginationOpts, streamArgs }) => {
    await authorizeThreadAccess(ctx, threadId);
    const paginated = await listUIMessages(ctx, components.agent, { threadId, paginationOpts });
    const streams = await uiAgent.syncStreams(ctx, { threadId, streamArgs });
    return { ...paginated, streams };
  },
});
