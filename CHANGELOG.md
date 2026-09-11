# Changelog

## Unreleased

## 0.1.0 (2026-09-11)

- Convex component with one `uiState` table keyed by opaque `scopeKey` and `messageId`, versioned last-write-wins writes, and batched deletion.
- `OpenUI` server class: `getState`, `setState`, `clearState`, and `api({ checkRead, checkWrite })` wrappers that require the app's authorization.
- JSON envelope encoding so OpenUI `$binding` keys can cross Convex's value boundary, with `JSON.stringify` semantics for the Renderer's `{ value, componentType }` field snapshots.
- `useOpenUIState` React hook: hydration before mount, debounced and ordered writes, focus-aware remote updates, no writes while streaming, flush on unmount and `pagehide`.
- `openui-convex/test` registration helper for `convex-test`.
- Example: a streaming chat on Convex Agent whose generated interfaces keep their state, with a consumer-side test of the wrappers.
