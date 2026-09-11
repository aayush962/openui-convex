# openui-convex

Durable, reactive state for [OpenUI](https://www.openui.com) interfaces on [Convex](https://convex.dev).

A generated form or interactive interface keeps its state across reloads and stays in sync across clients. Your application keeps control of rendering, actions, tools, and AI generation.

- One table: `(scopeKey, messageId) → state`, versioned, last write wins.
- Server helpers and browser wrappers that require your own authorization hooks.
- A React hook that hydrates your Renderer, debounces and orders writes, and applies remote updates without clobbering what the user is editing.
- No runtime dependencies. `convex` is a peer; `react` is an optional peer used only by `openui-convex/react`.

**Status:** 0.1.0, unreleased.

## Install

```sh
npm install openui-convex
```

Mount the component in `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import openui from "openui-convex/convex.config.js";

const app = defineApp();
app.use(openui);
export default app;
```

## Expose it behind your authorization

A component cannot see `ctx.auth`, so both hooks are required. Export the wrappers from a module in your `convex/` directory, for example `convex/openui.ts`:

```ts
import { OpenUI } from "openui-convex";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { requireScopeAccess } from "./auth"; // your check: throws unless the caller may use this scope

export const openui = new OpenUI(components.openui);
export const { getState, setState, clearState } = openui.api<DataModel>({
  checkRead: requireScopeAccess,
  checkWrite: requireScopeAccess,
});
```

Export only the wrappers browsers should call. `scopeKey` and `messageId` are opaque strings you choose: a thread id and message id, a document id and block id, a dashboard id and widget id.

## Render with your own Renderer

```tsx
import { Renderer } from "@openuidev/react-lang";
import { useOpenUIState } from "openui-convex/react";
import { api } from "../convex/_generated/api";

function GeneratedUI({ threadId, message }: { threadId: string; message: { key: string; text: string; status: string } }) {
  const streaming = message.status === "streaming";
  const ui = useOpenUIState({ api: api.openui, scopeKey: threadId, messageId: message.key, isStreaming: streaming });
  if (ui.isLoading) return null;
  return (
    <div {...ui.containerProps}>
      <Renderer
        key={ui.key}
        library={library}
        response={message.text}
        isStreaming={streaming}
        initialState={ui.initialState}
        onStateUpdate={ui.onStateUpdate}
        onAction={handleAction}
      />
    </div>
  );
}
```

What the hook returns:

- `isLoading`: wait for it before mounting, so the Renderer hydrates from the saved snapshot instead of its defaults.
- `key` and `initialState`: pass both. The key changes when a remote snapshot replaces local state, and the remount clears fields the snapshot no longer contains.
- `onStateUpdate`: `undefined` while streaming or loading, so incomplete state is never saved.
- `containerProps`: spread onto the element around the Renderer. Remote updates wait until focus leaves it.
- `flush()`: writes pending edits now. Await it before app-controlled navigation.

Options: `debounceMs` (default 400) and `onError`, which receives failed writes and invalid values.

Actions, tool providers, and the component library stay yours. The hook never sends messages or opens links.

## Contract

- **Conflicts.** Last write wins and every write increments `version`. The hook ignores snapshots older than what it already saved, defers remote snapshots while a write is in flight or the interface has focus, and applies them afterwards. There is no merge: this is form state, not collaborative text.
- **Encoding.** OpenUI state uses `$binding` keys, which Convex rejects as object keys. On the wire and in storage the state is a JSON envelope, `{ openuiEncoding: "json-v1", data: "..." }`. The hook and the server helpers encode and decode for you; use `encodeState` and `decodeState` if you call the wrappers directly. Values must be JSON: no `undefined`, `NaN`, dates, or cycles.
- **Limits.** One snapshot is at most 64 KiB of JSON. Larger or malformed writes are rejected before storage.
- **Reads.** Each interface subscribes to its own record. Nothing reads a whole scope, so a long thread costs only what is on screen.
- **Delivery.** Unmount and `pagehide` flush pending edits on a best-effort basis. A closed tab or a lost connection can lose the last debounce window.
- **Cleanup.** `clearState` deletes one interface or a whole scope, at most 100 records per call, and reports `hasMore`. Continue in a fresh transaction:

```ts
export const purgeThreadState = internalMutation({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const { hasMore } = await openui.clearState(ctx, { scopeKey: threadId });
    if (hasMore) await ctx.scheduler.runAfter(0, internal.threads.purgeThreadState, { threadId });
  },
});
```

Server helpers for your own functions: `openui.getState` (returns decoded state; encode it again before returning it to a client), `openui.setState`, and `openui.clearState`.

## With Convex Agent

[Convex Agent](https://docs.convex.dev/agents) owns threads, messages, and streaming. This component adds persistent state per assistant message; use the thread id as the scope so thread authorization also guards interface state.

```tsx
const { results } = useUIMessages(api.chat.listMessages, { threadId }, { initialNumItems: 20, stream: true });
// For each assistant message:
const ui = useOpenUIState({
  api: api.openui,
  scopeKey: threadId,
  messageId: message.key,
  isStreaming: message.status === "streaming",
});
```

The `example/` app is a complete version of this recipe: `example/convex/chat.ts` streams OpenUI Lang through Agent, `example/convex/openui.ts` exports the wrappers, and `example/src/pages/Chat.tsx` renders each message.

## Testing

`openui-convex/test` registers the component with [convex-test](https://docs.convex.dev/testing/convex-test):

```ts
import { convexTest } from "convex-test";
import { register } from "openui-convex/test";
import schema from "./schema";

const t = convexTest(schema, import.meta.glob("./**/*.ts"));
register(t); // mounts the component as "openui"
```

## Run the example

Requires Node 20.19+ or 22.12+ and pnpm 10.7.1.

```sh
pnpm install --frozen-lockfile
npm run dev            # Convex dev deployment plus package codegen and build
npm run dev:frontend   # Vite on http://127.0.0.1:5173, in a second terminal
```

Configure the model on your development deployment:

```sh
npx convex env set ANTHROPIC_API_KEY <your-key>
npx convex env set OPENUI_TELEMETRY_DISABLED 1
npx convex env set ANTHROPIC_MODEL claude-sonnet-4-6   # optional
```

Ask for a form, edit it, reload the page or open a second window, and the values are still there.

The example is a shared, unauthenticated sandbox: anyone who reaches its backend can read threads and spend model credits, and nothing serializes concurrent generations in one thread. Add identity, ownership checks, and rate limiting before hosting it publicly, and keep model keys out of `VITE_` variables.

## Development

```sh
npm run check   # build, typecheck, lint, tests, example build, export check
```

Checks run against the committed generated files and need no deployment. After changing the component's functions, run `npm run build:codegen` against a development deployment to regenerate `src/component/_generated`. `example/convex/openui.test.ts` shows how an app tests code that uses the component. Releases are described in [PUBLISHING.md](PUBLISHING.md).
