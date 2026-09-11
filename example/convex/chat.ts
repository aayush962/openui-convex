import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { Agent, getThreadMetadata, listUIMessages, syncStreams, vStreamArgs } from "@convex-dev/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { components, internal } from "./_generated/api";
import { internalAction, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { systemPrompt } from "./prompt";

/** Demo app without auth: any client may read and write any thread whose id it knows. */
export async function authorizeThreadAccess(ctx: QueryCtx | MutationCtx, threadId: string) {
  // Replace with identity + ownership checks before exposing private conversations or a funded model key.
  await getThreadMetadata(ctx, components.agent, { threadId });
}

// Built per call so configuration is read in a handler, not during deployment analysis.
function uiAgent() {
  return new Agent(components.agent, {
    name: "ui-agent",
    languageModel: anthropic(process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"),
  });
}

export const createThread = mutation({
  args: {},
  returns: v.string(),
  handler: async ctx => {
    const { threadId } = await uiAgent().createThread(ctx, {});
    return threadId;
  },
});

export const sendMessage = mutation({
  args: { threadId: v.string(), prompt: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId, prompt }) => {
    if (!prompt.trim() || prompt.length > 32_000) throw new Error("A prompt must contain between 1 and 32,000 characters");
    await authorizeThreadAccess(ctx, threadId);
    const { messageId } = await uiAgent().saveMessage(ctx, { threadId, prompt, skipEmbeddings: true });
    await ctx.scheduler.runAfter(0, internal.chat.generate, { threadId, promptMessageId: messageId });
    return null;
  },
});

export const generate = internalAction({
  args: { threadId: v.string(), promptMessageId: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId, promptMessageId }) => {
    await uiAgent().streamText(
      ctx,
      { threadId },
      { promptMessageId, system: systemPrompt() },
      // OpenUI Lang is one statement per line, so line chunking means fewer partial-statement flickers.
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
    const streams = await syncStreams(ctx, components.agent, { threadId, streamArgs });
    return { ...paginated, streams };
  },
});
