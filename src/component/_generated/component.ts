/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    state: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { messageId?: string; scopeKey: string },
        { deleted: number; hasMore: boolean },
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { messageId: string; scopeKey: string },
        null | {
          instanceId: string;
          state: Record<string, any>;
          version: number;
        },
        Name
      >;
      set: FunctionReference<
        "mutation",
        "internal",
        { messageId: string; scopeKey: string; state: Record<string, any> },
        { version: number },
        Name
      >;
    };
  };
