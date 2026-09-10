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
    actions: {
      list: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          scopeKey: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _creationTime: number;
            _id: string;
            createdAt: number;
            formName?: string;
            formState?: any;
            humanFriendlyMessage?: string;
            messageId: string;
            params: any;
            scopeKey: string;
            type: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        },
        Name
      >;
      record: FunctionReference<
        "mutation",
        "internal",
        {
          formName?: string;
          formState?: any;
          humanFriendlyMessage?: string;
          messageId: string;
          params: any;
          scopeKey: string;
          type: string;
        },
        string,
        Name
      >;
    };
    state: {
      clear: FunctionReference<
        "mutation",
        "internal",
        { messageId?: string; scopeKey: string },
        null,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { messageId: string; scopeKey: string },
        null | { state: Record<string, any>; version: number },
        Name
      >;
      listByScope: FunctionReference<
        "query",
        "internal",
        { scopeKey: string },
        Array<{
          messageId: string;
          state: Record<string, any>;
          version: number;
        }>,
        Name
      >;
      set: FunctionReference<
        "mutation",
        "internal",
        {
          clientVersion?: number;
          messageId: string;
          scopeKey: string;
          state: Record<string, any>;
        },
        { version: number },
        Name
      >;
    };
  };
