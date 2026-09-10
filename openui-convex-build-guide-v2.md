# `openui-convex` — Build Guide v2

**Verified against live docs on 2026-09-10.** Supersedes the v1 implementation plan entirely.

A Convex component + React bindings that make [OpenUI](https://github.com/thesysdev/openui) (Thesys's MIT-licensed Generative UI standard) run natively on [Convex](https://convex.dev), with `@convex-dev/agent` doing LLM streaming.

This document is an executable spec for coding agents (Claude Code / Codex / Cursor). Work phases in order. Each phase ends in acceptance criteria — do not proceed until they pass.

---

## 0. Agent setup — do this before touching code

### 0.1 Tooling that makes agents good at this stack

Both ecosystems ship first-class agent tooling. Install all of it in the repo before Phase 0:

```sh
# Convex: writes a managed Convex section into CLAUDE.md + AGENTS.md and installs
# Convex Agent Skills into .agents/skills/ (schema design, migrations, auth, etc.)
npx convex ai-files install

# Convex MCP server (built into the CLI) so the agent can inspect the real dev
# deployment instead of guessing — add to the agent's MCP config:
#   command: npx   args: ["convex", "mcp", "start"]
# Claude Code / Cursor / Codex users: install the Convex plugin instead; it bundles
# the MCP server plus convex-expert and convex-reviewer subagents.
# Ref: https://docs.convex.dev/ai/convex-mcp-server

# OpenUI: official Agent Skill (component library design, OpenUI Lang syntax,
# prompt generation, Renderer, debugging malformed output)
npx skills add thesysdev/skills --skill openui
```

OpenUI also exposes a docs MCP at `https://www.openui.com/docs/mcp` and is indexed on Context7 (`thesysdev/openui`). Every Convex docs page is available as markdown by appending `.md` to its URL; the full index is `https://docs.convex.dev/llms.txt`. Every OpenUI docs page has a "Copy Markdown" button and `Accept: text/markdown` works for Convex.

### 0.2 Sandboxing the agent's deployment access

Per `https://docs.convex.dev/ai`: create a deploy key scoped to the agent's **own dev deployment** and put it in `.env.local` as `CONVEX_DEPLOY_KEY`, so the agent can only push to its dev deployment — never prod. In a non-interactive shell, `npx convex dev --once` auto-provisions a local backend without prompting for login. Set model API keys as project environment-variable defaults (or `npx convex env set ANTHROPIC_API_KEY ...`).

### 0.3 Ground rules (non-negotiable)

1. **Verify before writing code against an external API.** Every `VERIFY:` marker below is a known uncertainty. Resolve it by reading the linked doc or installed package types, then log the resolution in `DECISIONS.md` at repo root.
2. **Pin exact versions** of all `@openuidev/*` packages (`npm view <pkg> version`; no `^`). OpenUI is at 0.x with ~90 open PRs; the API moves.
3. **Never import `@openuidev/react-lang` or `@openuidev/react-ui` from any `convex/` directory or `src/component/`.** They pull React. Server-side prompt generation uses `@openuidev/lang-core` only (§7.2). Enforce with an ESLint `no-restricted-imports` rule.
4. **Never run `npx convex deploy`. Never `npm publish`.** Phase 6 does `npm pack` dry-runs only; a human publishes.
5. Component build ordering is **component codegen → package build → example `convex dev`** (the template's scripts already do this).
6. Small commits, one per task ID. Do not run git commands unless the task says so.

### 0.4 Required reading (in this order, `.md` suffix works on Convex docs)

| # | Doc | Why |
|---|---|---|
| 1 | `https://docs.convex.dev/components/authoring` | Anatomy, ComponentApi rules, env vars, client-code patterns, build, testing |
| 2 | `https://github.com/get-convex/templates/tree/main/template-component` (package.json, tsconfig.build.json, src/test.ts, PUBLISHING.md) | The exact skeleton we copy |
| 3 | `https://github.com/get-convex/prosemirror-sync/blob/main/src/client/index.ts` | The `syncApi()` re-export pattern we mirror (§8.4) |
| 4 | `https://docs.convex.dev/agents/streaming` and `/agents/messages` | Delta streaming API and `useUIMessages` |
| 5 | `https://www.openui.com/docs/openui-lang/system-prompts` | CLI spec generation + `generateSystemPrompt` (backend path) |
| 6 | `https://www.openui.com/docs/openui-lang/renderer` | Renderer props, error codes, streaming behavior |
| 7 | `https://www.openui.com/docs/openui-lang/queries-mutations` and `/specification-v05` | Query/Mutation/Action semantics, prompt feature flags |
| 8 | `https://www.openui.com/docs/api-reference/react-lang`, `/react-headless`, `/react-ui` | Library/ToolSpec types, ChatProvider handler contract, AgentInterface |

---

## 1. What changed since v1 (deltas the deep-research pass found)

| Topic | v1 assumed | Verified reality | Effect |
|---|---|---|---|
| Server-side prompts | Generate at build time by importing react-ui under Node | OpenUI's **recommended backend path** is `openui generate` → `system-prompt.spec.json` → `generateSystemPrompt({ library, promptOptions })` from `@openuidev/lang-core` (no React dependency, runs anywhere) | Prompts are generated **inside the Convex action**, dynamically, with per-request `tools`. Cleaner. |
| Tool declaration | Unknown ("VERIFY") | `promptOptions.tools: ToolSpec[]` where `ToolSpec = { name, description, inputSchema, outputSchema }` (MCP-shaped); `toolCalls` defaults true when tools are provided | One shared tool registry projects to both the prompt (server) and the `toolProvider` (client) |
| Query semantics | One-shot fetch + manual `@Run` | `Query("tool", args, defaults, ttlSeconds?)` runs on load, **auto-refetches when bound `$variables` change**, optional periodic refresh; mutations only via `@Run` inside `Action([...])`; `result.status`/`result.error` available | Reactive-query upgrade is still v2, but the language already re-runs queries — Convex just makes results fresher |
| Agent `streamText` signature | `thread.streamText(args, opts)` | `agent.streamText(ctx, { threadId }, { prompt }, { saveStreamDeltas: { chunking, throttleMs } })`; chunking is `"word" | "line" | RegExp | fn` | Use the 4-arg form |
| Component API exposure | Pass function refs as props | Official pattern is a class with an `api({ checkRead, checkWrite })` method returning `queryGeneric`/`mutationGeneric` that the app re-exports; hooks typed via `ApiFromModules` | React layer takes `api.openui` (one module ref), not five function refs |
| Pagination | Normal `.paginate()` | **`.paginate()` does not work inside components**; use `paginator` from `convex-helpers` | `listActions` uses `paginator` or a bounded `limit` |
| Env vars | Not available in components | Components can declare **typed env** via `defineComponent(name, { env })`; apps pass values (or references) in `app.use()` | We declare none (config comes via args), but note it |
| `/test` entrypoint | Not planned | Template exports `./test` with `register(t, name)` that calls `t.registerComponent(name, schema, modules)` | Required for consumers to test |
| Entry points | `.`, `./convex.config`, `./react` | Template also exports `./_generated/component(.js)` (types only) and `./package.json` | Copy the template's exports map verbatim |
| React version | 18 or 19 | `@openuidev/react-ui` peers: `react >= 19`, `zustand ^4.5.5` | Example app on React 19; package peer `VERIFY:` react-lang floor |
| Directory submission | "Challenge with prizes" | Prizes ended; rolling review. Rules: follow authoring best practices, **published on npm**, author commits to maintain it, **link a demo app**. Submit at `https://www.convex.dev/components/submit` | Demo app is a hard requirement — the `example/` app must be deployable |
| OpenUI paid tier | "OpenUI Cloud" | Now presented as **OpenUI Gateway** (`generateSystemPrompt({ cloud: true })` emits a managed config block) | README positioning: "the self-hosted stateful runtime; use Gateway if you want their managed validation/model layer" |
| Telemetry | — | `@openuidev/lang-core` sends 10%-sampled telemetry on server-side `generateSystemPrompt` calls; opt out with `OPENUI_TELEMETRY_DISABLED=1` or `DO_NOT_TRACK=1` | Document in README; set the env var in the example deployment |
| Error handling | — | `onError` returns structured `OpenUIError[]` (`source`, `statementId`, `message`, `hint`), designed for LLM self-correction; `tool-not-found` is a first-class code | Enables an optional auto-correction loop (§13.4) and the security test |
| Agent tooling | — | `npx convex ai-files install`, Convex MCP/plugins, OpenUI Agent Skill + docs MCP | §0.1 |

---

## 2. Product definition

### 2.1 Thesis

OpenUI Lang is streamed text. `@convex-dev/agent` already persists threads and streams text deltas through the database over websockets — resumable, multi-client, no HTTP streaming. So the transport problem is solved. What open-source OpenUI lacks is a stateful backend (persisted interactive state, multi-client sync, resumability), which is exactly what OpenUI Gateway sells. This component is the self-hosted version of that layer, on Convex.

### 2.2 The four seams (all public, documented APIs — no hacks)

| # | OpenUI side | Convex side | We build |
|---|---|---|---|
| 1 Transport | `<Renderer response={string|null} isStreaming />`; parser re-runs per chunk, forward refs resolve as statements arrive | `agent.streamText(..., { saveStreamDeltas: { chunking: "line" } })` → `listUIMessages` + `syncStreams` → `useUIMessages(..., { stream: true })` | Wiring only |
| 2 Tools | `toolProvider: Record<string, (args) => Promise<unknown>>`; prompt gets `ToolSpec[]` | `client.query(ref, args)` / `client.mutation(ref, args)` | One shared **tool registry** → prompt specs (server) + allowlisted function map (client) |
| 3 State | `initialState` hydrates on load; `onStateUpdate(state)` fires on field changes with the raw state map | Component tables `uiState` (isolated) | Debounced persistence + multi-client sync |
| 4 Loop & compat | `onAction(ActionEvent)` with `continue_conversation`, `formState`, `humanFriendlyMessage`; `ChatProvider` custom handlers | Agent send-message mutation; Convex client watch → AG-UI event bridge | Default action handling; optional headless compat |

### 2.3 Architecture invariants

- **I1.** Convex DB is the sole source of truth. OpenUI's `ChatProvider` (Phase 5 only) is a projection driven by our bridge; it never owns state.
- **I2.** No `StreamProtocolAdapter` implementation for the core path — that interface parses HTTP `Response` streams. Core path: DB → `useUIMessages` → `<Renderer>`.
- **I3.** The model only emits **tool names**. The name → Convex function mapping is a developer-authored allowlist. A `tool-not-found` error, not an execution, is the outcome for anything unlisted.
- **I4.** The component never imports `@convex-dev/agent`. It keys everything by an opaque `scopeKey: string` (agent users pass `threadId`) and `messageId: string`. All IDs cross the boundary as `v.string()`.
- **I5.** Component functions are never exposed to browsers. Apps re-export `openui.api({ checkRead, checkWrite })` functions that own auth (`ctx.auth` is unavailable inside components).
- **I6.** Zod component schemas live in framework-free modules; React renderers attach client-side; the server only ever sees the CLI-generated `LibrarySpec` JSON.
- **I7.** Every phase leaves the repo shippable.

### 2.4 Deliverables

1. npm package `openui-convex` (MIT) — component, server client class, `openui-convex/react`, `openui-convex/react/headless`, `openui-convex/test`.
2. `example/` — deployable Vite + React 19 + Convex demo (required for directory submission) with three pages: streaming chat, live-data tools, prebuilt `AgentInterface`.
3. Tests (`convex-test` + vitest), CI, README, `DECISIONS.md`, `CHANGELOG.md`.

---

## 3. Patterns copied from official components

These are the conventions the reviewers will look for. Follow them literally.

| Pattern | Source | How we apply it |
|---|---|---|
| Single root `package.json` + `node_modules`; example-only deps as `devDependencies`; example imports the package by name, resolved via `exports` → `dist/` | Authoring docs §"Local package resolution" | Same |
| `tsc --project tsconfig.build.json` build; `convex dev --start 'npm run dev:build'`; chokidar-driven `build:codegen` (`npx convex codegen --component-dir ./src/component && npm run build`); `typecheck` covers root + `example` + `example/convex` | Template `package.json` | Copy scripts verbatim |
| Exports: `./package.json`, `.`, `./react`, `./test` (→ `src/test.ts`), `./_generated/component(.js)` (types), `./convex.config(.js)` | Template | Add `./react/headless` |
| Class client: `constructor(public component: ComponentApi)`; `import type { ComponentApi } from "../component/_generated/component.js"` | prosemirror-sync, authoring docs | `class OpenUI` |
| Minimal ctx types: `type RunMutationCtx = { runMutation: GenericMutationCtx<GenericDataModel>["runMutation"]; runQuery: ... }` | prosemirror-sync | Same shape |
| `syncApi(opts)` returning `queryGeneric`/`mutationGeneric` with `checkRead`/`checkWrite` hooks; app destructures and exports; type via `ApiFromModules<{ x: ReturnType<C["syncApi"]> }>["x"]` | prosemirror-sync (`useTiptapSync(api.prosemirror, id)`) | `openui.api()`; React takes `api.openui` |
| All public component functions have `args` **and** `returns` validators (`schema.doc("table")` helper) | Authoring docs | Every function |
| Test helper: `export function register(t, name = "openui") { t.registerComponent(name, schema, modules) }` with `import.meta.glob("./component/**/*.ts")` | Template `src/test.ts` | Same |
| Pagination inside components via `paginator` from `convex-helpers` | Authoring docs | `listActions` |
| Function handles (`createFunctionHandle`) when a component must call back into the app | Authoring docs | Not needed in v0.1 (actions round-trip through the app's own mutations); note for `onAction` server hooks later |

---

## 4. Repository layout

```
openui-convex/
├── package.json                      # from template; see §5
├── tsconfig.json / tsconfig.build.json
├── eslint.config.js                  # template + no-restricted-imports rule (§0.3.3)
├── README.md  CHANGELOG.md  DECISIONS.md  PUBLISHING.md (from template)
├── src/
│   ├── component/                    # isolated Convex backend
│   │   ├── convex.config.ts          # defineComponent("openui")
│   │   ├── schema.ts
│   │   ├── state.ts                  # uiState functions
│   │   ├── actions.ts                # actionEvents functions
│   │   └── _generated/
│   ├── client/
│   │   ├── index.ts                  # class OpenUI, api(), types  (server + isomorphic)
│   │   ├── tools.ts                  # defineConvexTools registry (isomorphic, no React)
│   │   └── validators.ts
│   ├── react/
│   │   ├── index.ts
│   │   ├── OpenUIProvider.tsx
│   │   ├── OpenUIMessage.tsx
│   │   ├── useOpenUIThread.ts        # agent convenience hook
│   │   ├── useConvexToolProvider.ts
│   │   ├── stateSync.ts              # debounce + version tracking
│   │   └── headless/
│   │       ├── index.ts
│   │       ├── agUiBridge.ts         # Convex query watch → AG-UI events
│   │       ├── convert.ts            # agent UIMessage → OpenUI Message
│   │       └── handlers.ts           # createConvexChatHandlers
│   └── test.ts                       # register(t, name)
├── example/
│   ├── index.html  vite.config.ts  tsconfig.json
│   ├── src/
│   │   ├── main.tsx
│   │   ├── pages/Chat.tsx            # Phases 1–4
│   │   ├── pages/AgentInterface.tsx  # Phase 5
│   │   └── library/
│   │       └── index.ts              # exports the library + PromptOptions for the CLI
│   └── convex/
│       ├── convex.config.ts          # app.use(agent); app.use(openui)
│       ├── schema.ts                 # demo tables
│       ├── agents.ts                 # uiAgent
│       ├── chat.ts                   # thread CRUD, send, list (with streams)
│       ├── openui.ts                 # export const {...} = openui.api({...})
│       ├── openuiTools.ts            # shared tool registry (§10.1)
│       ├── demoData.ts               # allowlisted demo queries/mutations
│       ├── prompt.ts                 # generateSystemPrompt wrapper
│       └── generated/
│           ├── system-prompt.spec.json   # from `openui generate` — committed
│           └── system-prompt.txt         # reference only
└── .github/workflows/ci.yml
```

---

## 5. package.json (delta from the template)

Start from the template's file (§3) and change only:

```jsonc
{
  "name": "openui-convex",
  "description": "OpenUI generative UI on Convex — streaming, persistent state, tools, and headless compat.",
  "license": "MIT",
  "keywords": ["convex", "component", "openui", "generative-ui", "agent"],
  "exports": {
    "./package.json": "./package.json",
    ".": { "types": "./dist/client/index.d.ts", "default": "./dist/client/index.js" },
    "./react": { "types": "./dist/react/index.d.ts", "default": "./dist/react/index.js" },
    "./react/headless": { "types": "./dist/react/headless/index.d.ts", "default": "./dist/react/headless/index.js" },
    "./test": "./src/test.ts",
    "./_generated/component.js": { "types": "./dist/component/_generated/component.d.ts" },
    "./_generated/component": { "types": "./dist/component/_generated/component.d.ts" },
    "./convex.config.js": { "types": "./dist/component/convex.config.d.ts", "default": "./dist/component/convex.config.js" },
    "./convex.config": { "types": "./dist/component/convex.config.d.ts", "default": "./dist/component/convex.config.js" }
  },
  "peerDependencies": {
    "convex": "^1.36.1",
    "react": ">=19.0.0",                       // VERIFY: react-lang's floor; relax to ^18.3.1 || ^19 if it supports 18
    "@openuidev/react-lang": "<EXACT>",
    "@openuidev/lang-core": "<EXACT>",
    "@convex-dev/agent": "^0.3.0",             // VERIFY current major; used only by /react convenience hook + headless
    "@openuidev/react-headless": "<EXACT>"     // optional peer, headless entry only
  },
  "peerDependenciesMeta": {
    "@convex-dev/agent": { "optional": true },
    "@openuidev/react-headless": { "optional": true }
  },
  "dependencies": { "convex-helpers": "^0.1.x" }   // paginator; VERIFY current version
}
```

Example-only devDependencies to add: `@convex-dev/agent`, `ai`, `@ai-sdk/anthropic` (or openai), `@openuidev/react-ui`, `@openuidev/react-headless`, `@openuidev/cli`, `zod` (**VERIFY** the Zod major that `@openuidev/react-lang` peers on — Zod 4 has native `z.toJSONSchema`; Zod 3 needs `zod-to-json-schema`), `react@19`, `react-dom@19`, `vite`, `@vitejs/plugin-react`.

Keep the template's `@edge-runtime/vm`, `convex-test`, `vitest --typecheck`, `pkg-pr-new`, `@convex-dev/eslint-plugin`.

---

## 6. Phase 0 — Bootstrap (½ day)

- **P0.1** `npx create-convex@latest --component` → name `openui-convex`. Read the generated README and `PUBLISHING.md`. Rename the sample component to `openui` in `src/component/convex.config.ts`:
  ```ts
  import { defineComponent } from "convex/server";
  export default defineComponent("openui");
  ```
- **P0.2** Convert the example app to Vite + React 19 if the template ships something else (keep it inside `example/`, deps as root devDependencies). `example/convex/convex.config.ts`:
  ```ts
  import { defineApp } from "convex/server";
  import agent from "@convex-dev/agent/convex.config.js";
  import openui from "openui-convex/convex.config.js";
  const app = defineApp();
  app.use(agent);
  app.use(openui);
  export default app;
  ```
- **P0.3** Pin versions (`npm view @openuidev/react-lang version` etc.); write the version table into `DECISIONS.md`.
- **P0.4** Add the ESLint rule forbidding `@openuidev/react-lang|react-ui|react-headless` and `react` imports under `src/component/**` and `example/convex/**`.
- **P0.5** `npx convex env set ANTHROPIC_API_KEY ...` and `OPENUI_TELEMETRY_DISABLED=1` on the dev deployment (document both in README).

**Acceptance:** `npm run dev` runs codegen → build → `convex dev` cleanly; dashboard shows `agent` and `openui` components; `npm run build` emits every export path; a scratch `node -e "import('openui-convex/convex.config.js')"` resolves.

---

## 7. Phase 1 — Prompt pipeline + streaming spike (1–2 days)

Goal: Seam 1 end-to-end in the example app, using OpenUI's built-in chat library so no custom components are needed yet.

### 7.1 Library module for the CLI — `example/src/library/index.ts`

```ts
import { openuiChatLibrary, openuiChatPromptOptions } from "@openuidev/react-ui/genui-lib";
export const library = openuiChatLibrary;          // VERIFY: CLI's expected export shape
export const promptOptions = openuiChatPromptOptions; // CLI auto-detects exported PromptOptions
export default library;
```

### 7.2 Spec generation (build-time) and prompt generation (runtime)

Add script `gen:spec`:
```sh
npx @openuidev/cli@latest generate ./example/src/library/index.ts --out ./example/convex/generated/system-prompt.txt
```
This writes **both** `system-prompt.txt` and `system-prompt.spec.json`. Commit the `.spec.json`; the `.txt` is reference only. Run `gen:spec` in `predev`/`prebuild`.

`example/convex/prompt.ts` (default Convex runtime, no `"use node"` needed — lang-core is pure JS; **VERIFY** the bundle builds; if a Node-only import sneaks in, move `generate` to a `"use node"` action):

```ts
import { generateSystemPrompt, type LibrarySpec, type ToolSpec } from "@openuidev/lang-core";
import librarySpec from "./generated/system-prompt.spec.json";   // VERIFY resolveJsonModule in example/convex tsconfig

let cached: Map<string, string> | undefined;
export function systemPrompt(opts: { tools?: ToolSpec[]; toolExamples?: string[] } = {}) {
  // Lazy: never generate at module scope (deployment analysis runs module scope).
  const key = JSON.stringify(opts.tools?.map((t) => t.name) ?? []);
  cached ??= new Map();
  if (!cached.has(key)) {
    cached.set(key, generateSystemPrompt({
      library: librarySpec as LibrarySpec,
      promptOptions: {
        tools: opts.tools,
        toolExamples: opts.toolExamples,
        preamble: "You are an assistant that answers with OpenUI Lang interfaces.",
        additionalRules: ['Use @Reset after form submit, not @Set($var, "")'],
        // inlineMode: false in v0.1 — every assistant turn is UI (§13.6)
      },
    }));
  }
  return cached.get(key)!;
}
```

### 7.3 Agent + chat wrappers

`example/convex/agents.ts`:
```ts
import { Agent } from "@convex-dev/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { components } from "./_generated/api";

export const uiAgent = new Agent(components.agent, {
  name: "ui-agent",
  languageModel: anthropic("claude-sonnet-4-6"),   // VERIFY current option name in agent docs
  // instructions are passed per call so tools can vary — see chat.ts
});
```

`example/convex/chat.ts` — follow `https://docs.convex.dev/agents/streaming` exactly:
- `createThread` (mutation) → agent thread creation; return `threadId`.
- `sendMessage` (mutation): authorize; save the user message via the agent's `saveMessage`; `ctx.scheduler.runAfter(0, internal.chat.generate, { threadId, promptMessageId })`.
- `generate` (internal action):
  ```ts
  await uiAgent.streamText(
    ctx,
    { threadId },
    { promptMessageId, system: systemPrompt({ tools: toolSpecs() }) },   // VERIFY where per-call instructions go
    { saveStreamDeltas: { chunking: "line", throttleMs: 250 } },
  );
  ```
  Rationale for `"line"`: OpenUI Lang is one statement per line, so the client mostly re-parses whole statements — fewer partial-prop flickers than word chunking.
- `listMessages` (query): `args: { threadId, paginationOpts: paginationOptsValidator, streamArgs: vStreamArgs }`; `listUIMessages` + `syncStreams`; return `{ ...paginated, streams }`.
- Thread CRUD wrappers (`listThreads`, `renameThread`, `deleteThread`) for Phase 5.

### 7.4 Client spike — `example/src/pages/Chat.tsx`

```tsx
import { useUIMessages } from "@convex-dev/agent/react";
import { Renderer } from "@openuidev/react-lang";
import { openuiChatLibrary } from "@openuidev/react-ui/genui-lib";
import "@openuidev/react-ui/components.css";   // VERIFY current style entrypoints

const { results } = useUIMessages(api.chat.listMessages, { threadId }, { initialNumItems: 20, stream: true });
// per assistant message:
<Renderer key={m.key} library={openuiChatLibrary} response={m.text} isStreaming={m.status === "streaming"} onError={console.warn} />
```
Do **not** wrap in `useSmoothText`; the parser handles partial documents and smoothing only delays statements. Memoize the message component so only the streaming message re-renders on each delta.

**Acceptance (Phase 1):**
1. "Show a bar chart comparing revenue Jan–Jun" → chart appears **progressively** mid-stream.
2. "Give me a contact form" → form renders and accepts input.
3. Reload mid-stream → the in-flight message backfills and continues.
4. Two browser windows on the same thread render identically, live.
5. `onError` receives `[]` on the happy path; log any parser error codes seen into `DECISIONS.md` (they inform prompt `additionalRules`).

---

## 8. Phase 2 — The component: persistent UI state (2–3 days)

### 8.1 Schema — `src/component/schema.ts`

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  uiState: defineTable({
    scopeKey: v.string(),                     // opaque; agent users pass threadId (I4)
    messageId: v.string(),                    // agent UIMessage key
    state: v.record(v.string(), v.any()),     // Renderer's raw field-state map
    version: v.number(),                      // monotonic per doc
    updatedAt: v.number(),
  }).index("by_scope_message", ["scopeKey", "messageId"]),

  actionEvents: defineTable({
    scopeKey: v.string(),
    messageId: v.string(),
    type: v.string(),                         // ActionEvent.type e.g. "continue_conversation"
    params: v.any(),
    formName: v.optional(v.string()),
    formState: v.optional(v.any()),
    humanFriendlyMessage: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_scope_created", ["scopeKey", "createdAt"]),
});
```

### 8.2 Functions — `src/component/state.ts`, `actions.ts`

Import `query`/`mutation` from `./_generated/server` (never from the app). Every function has `args` and `returns` validators (define `vStateDoc`, `vActionEvent` in `src/client/validators.ts` and reuse them on both sides of the boundary).

- `state.get({ scopeKey, messageId })` → `{ state, version } | null`
- `state.listByScope({ scopeKey })` → `Array<{ messageId, state, version }>` — **the hot path**: one subscription hydrates a whole thread.
- `state.set({ scopeKey, messageId, state, clientVersion? })` → `{ version }`. Semantics: last-write-wins; `version = (existing?.version ?? 0) + 1`; ignore `clientVersion` except to return `version` so clients converge. Document CAS/merge as a v2 upgrade.
- `state.clear({ scopeKey, messageId? })` → `null`.
- `actions.record({...})` → `v.string()` (id as string).
- `actions.list({ scopeKey, paginationOpts })` using `paginator` from `convex-helpers/server/pagination` (built-in `.paginate()` is unsupported in components).

### 8.3 Client class — `src/client/index.ts`

```ts
import {
  type ApiFromModules, type GenericDataModel, type GenericMutationCtx, type GenericQueryCtx,
  mutationGeneric, queryGeneric, paginationOptsValidator,
} from "convex/server";
import { v, type VString } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import { vStateDoc, vActionEvent } from "./validators.js";

export type RunQueryCtx = { runQuery: GenericQueryCtx<GenericDataModel>["runQuery"] };
export type RunMutationCtx = RunQueryCtx & { runMutation: GenericMutationCtx<GenericDataModel>["runMutation"] };

export class OpenUI<ScopeKey extends string = string> {
  constructor(public component: ComponentApi) {}

  getState(ctx: RunQueryCtx, args: { scopeKey: ScopeKey; messageId: string }) {
    return ctx.runQuery(this.component.state.get, args);
  }
  listState(ctx: RunQueryCtx, args: { scopeKey: ScopeKey }) { return ctx.runQuery(this.component.state.listByScope, args); }
  setState(ctx: RunMutationCtx, args: { scopeKey: ScopeKey; messageId: string; state: Record<string, unknown>; clientVersion?: number }) {
    return ctx.runMutation(this.component.state.set, args);
  }
  clearState(ctx: RunMutationCtx, args: { scopeKey: ScopeKey; messageId?: string }) { return ctx.runMutation(this.component.state.clear, args); }
  recordAction(ctx: RunMutationCtx, args: ActionRecordArgs<ScopeKey>) { return ctx.runMutation(this.component.actions.record, args); }

  /** Re-export pattern (mirrors ProsemirrorSync.syncApi). App: `export const {...} = openui.api({...})`. */
  api<DataModel extends GenericDataModel>(opts?: {
    checkRead?: (ctx: GenericQueryCtx<DataModel>, scopeKey: ScopeKey) => void | Promise<void>;
    checkWrite?: (ctx: GenericMutationCtx<DataModel>, scopeKey: ScopeKey) => void | Promise<void>;
    onAction?: (ctx: GenericMutationCtx<DataModel>, event: ActionRecordArgs<ScopeKey>) => void | Promise<void>;
  }) {
    const scopeKey = v.string() as VString<ScopeKey>;
    return {
      listState: queryGeneric({
        args: { scopeKey },
        returns: v.array(vStateDoc),
        handler: async (ctx, args) => { await opts?.checkRead?.(ctx, args.scopeKey); return ctx.runQuery(this.component.state.listByScope, args); },
      }),
      setState: mutationGeneric({
        args: { scopeKey, messageId: v.string(), state: v.record(v.string(), v.any()), clientVersion: v.optional(v.number()) },
        returns: v.object({ version: v.number() }),
        handler: async (ctx, args) => { await opts?.checkWrite?.(ctx, args.scopeKey); return ctx.runMutation(this.component.state.set, args); },
      }),
      clearState: mutationGeneric({ /* checkWrite → state.clear */ }),
      recordAction: mutationGeneric({
        args: { scopeKey, messageId: v.string(), type: v.string(), params: v.any(), formName: v.optional(v.string()), formState: v.optional(v.any()), humanFriendlyMessage: v.optional(v.string()) },
        returns: v.string(),
        handler: async (ctx, args) => {
          await opts?.checkWrite?.(ctx, args.scopeKey);
          await opts?.onAction?.(ctx, args);          // app-side hook (auth'd, has ctx.auth/db)
          return ctx.runMutation(this.component.actions.record, args);
        },
      }),
      listActions: queryGeneric({ args: { scopeKey, paginationOpts: paginationOptsValidator }, /* checkRead → actions.list */ }),
    };
  }
}

export type OpenUIApi = ApiFromModules<{ openui: ReturnType<OpenUI["api"]> }>["openui"];
export * from "./tools.js";
```

### 8.4 App re-export — `example/convex/openui.ts`

```ts
import { OpenUI } from "openui-convex";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { authorizeThreadAccess } from "./chat";

export const openui = new OpenUI(components.openui);
export const { listState, setState, clearState, recordAction, listActions } = openui.api<DataModel>({
  checkRead: (ctx, threadId) => authorizeThreadAccess(ctx, threadId),
  checkWrite: (ctx, threadId) => authorizeThreadAccess(ctx, threadId),
});
```

### 8.5 Test helper — `src/test.ts` (copy the template, rename default `"openui"`).

**Acceptance (Phase 2):** `convex-test` suite covers `set`/`get`/`listByScope`/`clear` (version increments, LWW), `actions.record`/`list` ordering; `register(t, "openui")` works from the example app's own tests; component functions are visible under the `openui` component in the dashboard; `npx convex run --component openui state:listByScope '{"scopeKey":"x"}'` returns `[]`.

---

## 9. Phase 3 — React layer (2–3 days)

### 9.1 `<OpenUIProvider>` — `src/react/OpenUIProvider.tsx`

```ts
type OpenUIProviderProps = {
  api: OpenUIApi;                      // api.openui from the app (typed via ApiFromModules)
  scopeKey: string;                    // threadId for agent users
  library: Library;
  toolProvider?: ToolProviderMap | McpClientLike | null;
  sendMessage?: (text: string, meta?: { context?: string; formState?: Record<string, unknown> }) => void | Promise<void>;
  onAction?: (e: ActionEvent) => boolean | void;   // return true = fully handled, skip defaults
  stateDebounceMs?: number;            // default 400
  persistState?: boolean;              // default true
  children: ReactNode;
};
```
Internals: one `useQuery(api.listState, { scopeKey })` subscription → `Map<messageId, { state, version }>`; `useMutation(api.setState)` and `useMutation(api.recordAction)`; context exposes `getInitial(messageId)`, `reportState(messageId, state)`, `remoteVersion(messageId)`, `handleAction(messageId, e)`.

### 9.2 `<OpenUIMessage>` — `src/react/OpenUIMessage.tsx`

Props: `{ messageId: string; text: string | null; status?: "streaming" | "success" | "failed" | "pending"; queryLoader?: ReactNode; onError?: (errors: OpenUIError[]) => void }`.

Renders `<Renderer library response={text} isStreaming={status === "streaming"} initialState toolProvider onStateUpdate onAction onError queryLoader />` with:
- **State out:** `onStateUpdate` → debounced (`stateDebounceMs`, trailing; flush on unmount) → `setState({ scopeKey, messageId, state, clientVersion })`; suppressed while `status === "streaming"` (the model may re-emit `$state` declarations mid-stream).
- **State in / multi-client:** `initialState` hydrates on load only (documented), so remote updates remount: track `lastLocalVersion`; when `remoteVersion > lastLocalVersion` and no focused element is inside this message's DOM subtree, set `key={`${messageId}:${remoteVersion}`}`. **VERIFY:** whether the current Renderer re-hydrates on `initialState` prop change; if yes, drop the remount.
- **Actions (default pipeline):** (1) user `onAction` → if `true`, stop; (2) fire-and-forget `recordAction` (audit); (3) `continue_conversation` → `sendMessage(e.humanFriendlyMessage ?? params.message, { context: params.context, formState: e.formState })`; (4) `open_url` → `window.open(url, "_blank", "noopener")`; (5) unknown → `console.warn` in dev.

### 9.3 `useOpenUIThread` — agent convenience (optional peer)

```ts
const { messages, status, loadMore, sendMessage } = useOpenUIThread(api.chat.listMessages, { threadId }, { initialNumItems: 20 });
// messages: Array<{ messageId, role, text, status, key }>
```
Wraps `useUIMessages(..., { stream: true })` and `useMutation(sendRef)`. The primitives (`<OpenUIMessage>`) take plain props so non-agent streams (e.g. `useStreamingUIMessages`, or the persistent-text-streaming component) work too.

### 9.4 `useConvexToolProvider` — `src/react/useConvexToolProvider.ts`

Takes the shared registry (§10.1) and a `ConvexReactClient` from `useConvex()`, returns a memoized function map: `{ [name]: (args) => client.query(ref, args ?? {}) | client.mutation(ref, args ?? {}) }`. Anything not in the registry is absent → Renderer raises `tool-not-found` (I3).

**Acceptance (Phase 3):**
1. Fill a generated form halfway → reload → values persist (`initialState`).
2. Two windows: type in A → B updates within ~1 s, A never loses focus/caret.
3. Clicking a generated `@ToAssistant` button posts a new user message and the agent replies in-thread; an `actionEvents` row exists.
4. `stateDebounceMs` respected (assert ≤1 mutation per 400 ms burst via a stub client in tests).

---

## 10. Phase 4 — Tools, prompts, live data (2 days)

### 10.1 Shared tool registry — `src/client/tools.ts` + `example/convex/openuiTools.ts`

One definition, two projections. Isomorphic (no React, no `convex/server` runtime imports):

```ts
// src/client/tools.ts
import type { FunctionReference } from "convex/server";
import type { ToolSpec } from "@openuidev/lang-core";
import type { ZodType } from "zod";

type ToolDef =
  | { kind: "query";    ref: FunctionReference<"query">;    description: string; input: ZodType; output?: ZodType }
  | { kind: "mutation"; ref: FunctionReference<"mutation">; description: string; input: ZodType; output?: ZodType };

export function defineConvexTools<T extends Record<string, ToolDef>>(defs: T) {
  return {
    defs,
    toToolSpecs(): ToolSpec[] {
      return Object.entries(defs).map(([name, d]) => ({
        name, description: d.description,
        inputSchema: toJsonSchema(d.input),            // VERIFY: z.toJSONSchema (Zod 4) vs zod-to-json-schema (Zod 3)
        outputSchema: d.output ? toJsonSchema(d.output) : undefined,
      }));
    },
    toToolProvider(client: { query: Function; mutation: Function }) {
      const map: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};
      for (const [name, d] of Object.entries(defs)) {
        map[name] = (args) => d.kind === "query" ? client.query(d.ref, args ?? {}) : client.mutation(d.ref, args ?? {});
      }
      return map;
    },
  };
}
```

```ts
// example/convex/openuiTools.ts  (imported by BOTH convex/chat.ts and src/pages/Chat.tsx)
import { z } from "zod";
import { api } from "./_generated/api";
import { defineConvexTools } from "openui-convex";

export const tools = defineConvexTools({
  listTodos:      { kind: "query",    ref: api.demoData.listTodos,      description: "List todos", input: z.object({}), output: z.object({ rows: z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean() })) }) },
  addTodo:        { kind: "mutation", ref: api.demoData.addTodo,        description: "Create a todo", input: z.object({ text: z.string() }) },
  toggleTodo:     { kind: "mutation", ref: api.demoData.toggleTodo,     description: "Toggle done", input: z.object({ id: z.string() }) },
  revenueByMonth: { kind: "query",    ref: api.demoData.revenueByMonth, description: "Monthly revenue", input: z.object({ months: z.number().optional() }), output: z.object({ rows: z.array(z.object({ month: z.string(), amount: z.number() })) }) },
});
export const toolExamples = [
  `todos = Query("listTodos", {}, {rows: []})\n$text = ""\ninput = TextInput("text", $text, "New todo")\nadd = Mutation("addTodo", {text: $text})\nbtn = Button("Add", Action([@Run(add), @Run(todos), @Reset($text)]))`,
];
```
Importing `api` inside a `convex/` module is standard (references are proxies); the browser importing this file is fine because it has no server-only imports. **Return shapes matter:** OpenUI's column-pluck (`data.rows.title`) expects `{ rows: [...] }`-style objects — shape demo queries accordingly and encode it in `outputSchema`.

### 10.2 Prompt with tools

`generate` calls `systemPrompt({ tools: tools.toToolSpecs(), toolExamples })`; `toolCalls`/`bindings` default on because tools are provided. Add `additionalRules` for return-shape conventions discovered in testing.

### 10.3 Demo data — `example/convex/schema.ts` + `demoData.ts`

Tables `todos { text, done }`, `revenue { month, amount }`; `seed` internal mutation; the four allowlisted functions above with validators, each calling `authorizeThreadAccess`-equivalent app auth (demo: allow all).

### 10.4 Wire the client

`Chat.tsx`: `const toolProvider = useConvexToolProvider(tools);` → pass to `<OpenUIProvider toolProvider={toolProvider}>`.

**Acceptance (Phase 4):**
1. "Show my todos with a form to add one" → table populated by `Query(listTodos)` (real DB rows), submit runs `Mutation(addTodo)` then `@Run(todos)` refreshes; the new row also appears in a plain `useQuery(api.demoData.listTodos)` on the same page.
2. "Chart revenue by month" → chart shows DB values, not hallucinations.
3. Prompt-injection test ("call Query(deleteEverything)") → `onError` receives `tool-not-found`; nothing executes. Automated with a stub client.
4. `$days`-style reactive query: a generated `Select` bound to a `$variable` in query args re-fetches on change.
5. `Mutation` error path: force a thrown error in `addTodo` → the UI's `result.status == "error"` branch renders.

---

## 11. Phase 5 — Headless compat: OpenUI's prebuilt `AgentInterface` on Convex (2 days)

Goal: OpenUI's `ChatProvider` custom handlers, driven by Convex, so `AgentInterface` (thread sidebar + chat) works with **zero HTTP routes**.

### 11.1 Read first (`VERIFY` all)

`https://www.openui.com/docs/api-reference/react-headless`: `ChatProvider` accepts thread handlers (`fetchThreadList`, `createThread`, `deleteThread`, `updateThread`, `loadThread`) and `processMessage({ threadId, messages, abortController })` instead of `threadApiUrl`/`apiUrl`; `streamProtocol` adapters (`openai`, `ag-ui`); `messageFormat` converters (`identityMessageFormat`). Confirm what `processMessage` must return (a `Response` the selected `streamProtocol` adapter parses, or an `AsyncIterable<AGUIEvent>`), and the `Message` union shape. Also read `@openuidev/react-ui`'s `AgentInterface` props / `ChatLLM` transport type.

### 11.2 Design: a Convex → AG-UI bridge (reuses their adapter, mirrors their LangChain package)

`src/react/headless/agUiBridge.ts`: given `client.watchQuery(api.chat.listMessages, { threadId, paginationOpts, streamArgs })` (**VERIFY** the non-React watch API: `watchQuery(...).onUpdate(cb)`), diff successive results for the target assistant message and emit AG-UI events — `RUN_STARTED` → `TEXT_MESSAGE_START` → `TEXT_MESSAGE_CONTENT` (suffix deltas; on non-suffix change emit `END` + new `START`) → `TEXT_MESSAGE_END` → `RUN_FINISHED` (or `RUN_ERROR` on `status === "failed"`). Expose both `asAsyncIterable()` and `asSseResponse()` so either `processMessage` contract works. Tear down the watch on completion or `abortController.abort()` (I1).

`src/react/headless/handlers.ts`:
```ts
export function createConvexChatHandlers(opts: { client: ConvexReactClient; api: ChatApiRefs; agent?: { streamProtocol: "ag-ui" } })
  : ThreadApiConfig & ChatApiConfig
```
Thread handlers are thin `client.query/mutation` calls over the example's thread CRUD; `loadThread` = one-shot `client.query(listMessages)` → `convert.ts`; `processMessage` = `client.mutation(sendMessage)` then the bridge.

### 11.3 Demo — `example/src/pages/AgentInterface.tsx`

`<ChatProvider {...createConvexChatHandlers({ client, api: {...} })} streamProtocol="ag-ui" messageFormat={identityMessageFormat}><AgentInterface library={openuiChatLibrary} … /></ChatProvider>` (**VERIFY** exact prop names and CSS imports).

**Acceptance (Phase 5):** create/rename/delete threads from OpenUI's own sidebar; streamed generative UI appears inside their surface; switching threads mid-stream shows no bleed; DevTools shows only the Convex websocket.

---

## 12. Phase 6 — Tests, CI, docs, publish prep, submission (2 days)

- **P6.1 Tests** (vitest, `environment: "edge-runtime"` per `convex-test`): component functions via `register(t, "openui")`; streaming-parser canary (feed a fixture OpenUI Lang string chunk-by-chunk through `createStreamingParser` and assert progressive `ParseResult`, including a `partial` node mid-stream); `defineConvexTools` projections (spec shape, allowlist rejection); AG-UI bridge diffing (suffix vs replace); debounce.
- **P6.2 CI** (`.github/workflows/ci.yml`): Node 20/22 matrix → `npm ci` → `npm run build:codegen` → `npm run typecheck` → `npm run lint` → `npm run test`. Optional: `pkg-pr-new publish` on PRs for preview installs.
- **P6.3 README** (structure): what/why; the four seams; 30-line quickstart (`app.use`, `openui.api()` re-export, `<OpenUIProvider api={api.openui}>`, `<OpenUIMessage>`); state persistence; tools + security model (I3); headless compat; OpenUI Gateway relationship; telemetry env var; roadmap (§13.5–13.7). Include a GIF of two windows syncing a generated form.
- **P6.4 Deployable demo**: `npx convex deploy` is a **human** step; the agent prepares `example/` with a `VITE_CONVEX_URL` build and a one-command deploy script + hosting notes (Vercel/Netlify static + Convex prod deployment). Directory submission requires a working demo link.
- **P6.5** `npm pack` dry-run; install the tarball into a scratch Vite project and run the README quickstart. **Stop for human publish** (template `release`/`alpha` scripts).
- **P6.6 Submission checklist (human):** `https://www.convex.dev/components/submit` (npm link, repo, demo URL, category "Full-Stack Drop-In Features"); OpenUI: PR adding `examples/app-frameworks/convex` (see `examples/README.md`) and an `ADOPTERS.md` line; post in both Discords (Convex `#components`, OpenUI); propose upstreaming as `@openuidev/convex`.

---

## 13. Technical notes

### 13.1 Streaming cadence
The agent single-flights delta writes at `throttleMs`; each write carries all chunks accumulated since the last one. With `chunking: "line"` a delta is ≥1 whole statements, so the Renderer almost never sees a half-statement except the trailing one. If the model emits very long single-line statements (big arrays), consider a RegExp chunker splitting on `,\s` inside brackets — measure first.

### 13.2 State sync & echo loops
Local edits → `onStateUpdate` → debounce → `setState`. The provider's `listState` subscription will echo the write back with a higher `version`; because `lastLocalVersion` is set from the mutation's returned `version`, the echo is ignored. Remote writes arrive with `remoteVersion > lastLocalVersion` → remount only if this message isn't focused. LWW is acceptable for form state; if two users edit the same field simultaneously the later write wins — document it.

### 13.3 Security model
The model never chooses a function path; `defineConvexTools` keys are the only executable names, and the Convex functions themselves are public functions that must do their own auth (they're normal app functions). Treat `Mutation()` tools as user-initiated actions: they run on the user's `ConvexReactClient` with the user's identity — same trust as a button in your app. Never expose an `internal*` function through the registry.

### 13.4 Self-correction loop (optional, v0.2)
`onError` errors are structured for LLMs (`source`, `statementId`, `message`, `hint`). A `correctOnError` provider option can post `"Fix these errors:\n…"` as a follow-up via `sendMessage` (rate-limited, max 1 retry per message) — the same loop OpenUI documents for its renderer.

### 13.5 Roadmap: reactive `Query()`
The language already re-runs queries when `$variables` change and supports a refresh-interval arg. A v2 `toolProvider` can subscribe (`client.onUpdate`) instead of one-shot `client.query` and push fresh results into the runtime — requires either an upstream hook for pushing query results or a wrapper around lang-core's `QueryManager`. Open a discussion issue upstream once v0.1 ships; it's the headline differentiator ("generated dashboards that stay live").

### 13.6 Modes
- v0.1: every assistant turn is UI (`inlineMode: false`). Simplest, and matches `AgentInterface`.
- v0.2: `inlineMode: true` lets the model answer in text + fenced OpenUI blocks; **VERIFY** whether the Renderer handles mixed responses or the message component must split markdown vs. code.
- Alternative pattern worth knowing: OpenUI's `@openuidev/assistant-ui` integration delivers UI as **tool calls** (`present_openui` for display, `prompt_openui` as a human-in-the-loop tool). With `@convex-dev/agent` that would map to agent tools and tool-part streaming. Not v0.1, but it's the right shape for mixed text/UI agents — note in README roadmap.

### 13.7 Roadmap: incremental editing
`editMode: true` makes the model emit only changed statements; `mergeStatements(original, patch)` from lang-core merges them. On Convex this means storing the merged document per message (a natural fit for `uiState`'s sibling table `uiDocs`) — v0.3.

### 13.8 Bundle hygiene
Component code and `convex/` code must stay React-free (§0.3.3). `@openuidev/lang-core` is the only OpenUI package allowed server-side. JSON spec imports are handled by Convex's bundler; keep the spec small by only registering the components you actually want the model to use.

---

## 14. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| `@openuidev/*` 0.x API drift | High | Exact pins; `DECISIONS.md`; parser canary test; re-read docs at each phase start; Context7/docs MCP for the agent |
| `generateSystemPrompt` vs older `generatePrompt` naming in installed version | Medium | Check lang-core exports before Phase 1; both take spec + tools |
| Renderer ignores `initialState` changes post-mount | Medium | Keyed remount (§9.2); upstream issue if confirmed |
| `processMessage` contract (Response vs iterable) | Medium | Bridge exposes both; Phase 5 isolated behind `/react/headless` |
| Agent streaming edge cases (duplicate streaming message after tool approval, issue #185) | Medium | Follow current agent docs; acceptance 7.4.3; pin agent minor |
| Zod major mismatch between OpenUI, agent, and example | Medium | Resolve in Phase 0; single `zod` version in root package.json |
| React 19 requirement for react-ui vs consumers on 18 | Low | Core package peers on react-lang's floor; only the example needs 19 |
| Convex bundler rejects a lang-core import | Low | Fallback: `"use node"` action for `generate` |

---

## 15. Definition of done (v0.1.0)

- All phase acceptance criteria pass; CI green on Node 20 and 22.
- README quickstart is literally runnable from a fresh `npm install openui-convex` in <30 lines of app code.
- Prompt-injection test proves the allowlist boundary; parser canary and bridge tests exist.
- No React import anywhere under `src/component/` or `example/convex/` (ESLint enforced).
- `openui-convex/test` `register()` works from an external project.
- Example app deployable with one documented command; demo URL ready for the directory submission.
- `DECISIONS.md` records every resolved `VERIFY:` with the doc URL and installed version it was checked against.
