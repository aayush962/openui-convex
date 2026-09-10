import { Agent } from "@convex-dev/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { components } from "./_generated/api";

export const uiAgent = new Agent(components.agent, {
  name: "ui-agent",
  languageModel: anthropic(process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"),
  // Instructions are passed per call (see chat.ts) so tools can vary.
});
