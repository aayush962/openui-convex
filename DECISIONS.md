# Design notes

Reviewed 2026-09-11 against the installed packages: Convex 1.45.0, Convex Agent 0.7.2, OpenUI React Lang 0.2.15, Lang Core 0.2.18, React UI 0.13.10, React 19, Zod 4.

## Scope

- The package persists and synchronizes OpenUI interface state. Rendering, action handling (`continue_conversation`, `open_url`), tool providers, prompt generation, and threads stay in the application. Convex Agent already owns threads, messages, and streaming, so the package composes with it instead of wrapping it.
- Removed from earlier drafts: the action-event audit table, automatic message sending and link opening, the Zod tool registry, the Agent convenience hook, and the headless adapter. Each duplicated application policy or added a dependency every consumer would carry.
- Runtime dependencies: `convex` as a peer. `react` is an optional peer used only by `openui-convex/react`. `convex-helpers` is no longer needed because no component function paginates.

## Data

- `uiState` is keyed by `(scopeKey, messageId)`. Both are opaque strings chosen by the application, so the component fits threads, documents, and dashboards. A `version` counter increments on every write, and the document id is returned as `instanceId` so a client can tell a recreated record, whose version restarts, from a stale echo.
- Raw OpenUI `$binding` keys are invalid Convex object keys: `convexToJson({ $name: "Ada" })` throws. State travels and is stored as `{ openuiEncoding: "json-v1", data }`. `state.set` decodes the envelope, re-serializes it with a strict JSON check, and rejects snapshots above 64 KiB.
- Reads are per interface (`get`), never per scope. `clear` deletes at most 100 records per call and reports `hasMore`; callers continue in a new transaction.

## React

- The Renderer re-initializes from `initialState` when it changes but never removes keys omitted by a later snapshot. The hook therefore remounts through `key` when a remote snapshot replaces local state, and defers that while a write is in flight or focus is inside the interface. A `focusout` listener on the container re-checks afterwards.
- Writes are debounced (400 ms trailing) and serialized in `StateSynchronizer`, so a slow request cannot overwrite a newer edit. Failed writes are reported through `onError`, and reporting the same value again retries.
- `onStateUpdate` is withheld while streaming: the model may re-emit state declarations mid-stream, and the Renderer re-initializes on each.

## Example

- Agent's four-argument `streamText(ctx, { threadId }, { promptMessageId, system }, { saveStreamDeltas })` with `line` chunking suits one-statement-per-line OpenUI Lang.
- The prompt is generated from the committed `system-prompt.spec.json` produced by `openui generate`, so the deployment needs neither React nor the component library.
- The demo has no auth, no per-thread generation lock, and no model rate limit. It is a shared sandbox, not a deployable product.
