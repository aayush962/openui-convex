import { generateSystemPrompt, type LibrarySpec, type ToolSpec } from "@openuidev/lang-core";
import librarySpec from "./generated/system-prompt.spec.json";

let cached: Map<string, string> | undefined;

/** Lazy: never generate at module scope (deployment analysis runs module scope). */
export function systemPrompt(opts: { tools?: ToolSpec[]; toolExamples?: string[] } = {}) {
  const key = JSON.stringify(opts.tools?.map(t => t.name) ?? []);
  cached ??= new Map();
  if (!cached.has(key)) {
    cached.set(key, generateSystemPrompt({
      library: librarySpec as LibrarySpec,
      promptOptions: {
        tools: opts.tools,
        toolExamples: opts.toolExamples,
        preamble: "You are an assistant that answers with OpenUI Lang interfaces.",
        additionalRules: ['Use @Reset after form submit, not @Set($var, "")'],
      },
    }));
  }
  return cached.get(key)!;
}
