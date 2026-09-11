import { generateSystemPrompt, type LibrarySpec } from "@openuidev/lang-core";
import librarySpec from "./generated/system-prompt.spec.json";

let cached: string | undefined;

/** Generated lazily: deployment analysis evaluates module scope, and generation is not free. */
export function systemPrompt() {
  cached ??= generateSystemPrompt({
    library: librarySpec as LibrarySpec,
    promptOptions: {
      preamble: "You are an assistant that answers with OpenUI Lang interfaces.",
      additionalRules: ['Use @Reset after form submit, not @Set($var, "")'],
    },
  });
  return cached;
}
