import {
  type ApiFromModules, type GenericDataModel, type GenericMutationCtx, type GenericQueryCtx,
  mutationGeneric, queryGeneric,
} from "convex/server";
import { v } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import { stateKey, stateSetArgs, stateClearArgs, vStateDoc, type UIState, type StateDoc } from "./validators.js";
import { decodeState, encodeState } from "./serialization.js";

export type RunQueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
export type RunMutationCtx = Pick<GenericMutationCtx<GenericDataModel>, "runMutation">;

/**
 * Server-side entry point. Construct it once with `components.openui`, then call the helpers from
 * your own functions or export the browser wrappers returned by `api(...)`.
 * The application owns authorization and chooses the opaque scope and message identifiers.
 */
export class OpenUI {
  constructor(public component: ComponentApi) {}
  /** Read decoded state inside a query or mutation. Encode it again before returning it to a browser. */
  async getState(ctx: RunQueryCtx, args: { scopeKey: string; messageId: string }) {
    const row = await ctx.runQuery(this.component.state.get, args);
    return row ? { ...row, state: decodeState(row.state) } : null;
  }
  /** Write state inside a mutation, for example to seed an interface. Last write wins. */
  setState(ctx: RunMutationCtx, args: { scopeKey: string; messageId: string; state: UIState }) {
    return ctx.runMutation(this.component.state.set, { ...args, state: encodeState(args.state) });
  }
  /** Delete one interface or a whole scope, at most 100 records per call. Repeat while `hasMore` is true. */
  clearState(ctx: RunMutationCtx, args: { scopeKey: string; messageId?: string }) {
    return ctx.runMutation(this.component.state.clear, args);
  }
  /**
   * Browser-facing wrappers. Export them from a module in your `convex/` directory:
   * `export const { getState, setState, clearState } = openui.api({ checkRead, checkWrite })`.
   * Both hooks are required: a component cannot see `ctx.auth`, so your app decides who may read or write a scope.
   * State crosses the wire encoded; `useOpenUIState` handles that, or use `encodeState`/`decodeState` yourself.
   */
  api<DataModel extends GenericDataModel = GenericDataModel>(opts: {
    checkRead: (ctx: GenericQueryCtx<DataModel>, scopeKey: string) => void | Promise<void>;
    checkWrite: (ctx: GenericMutationCtx<DataModel>, scopeKey: string) => void | Promise<void>;
  }) {
    return {
      getState: queryGeneric({
        args: stateKey, returns: v.union(v.null(), vStateDoc),
        handler: async (ctx, args): Promise<StateDoc | null> => {
          await opts.checkRead(ctx, args.scopeKey);
          return ctx.runQuery(this.component.state.get, args);
        },
      }),
      setState: mutationGeneric({
        args: stateSetArgs, returns: v.object({ version: v.number() }),
        handler: async (ctx, args) => {
          await opts.checkWrite(ctx, args.scopeKey);
          return ctx.runMutation(this.component.state.set, args);
        },
      }),
      clearState: mutationGeneric({
        args: stateClearArgs, returns: v.object({ deleted: v.number(), hasMore: v.boolean() }),
        handler: async (ctx, args) => {
          await opts.checkWrite(ctx, args.scopeKey);
          return this.clearState(ctx, args);
        },
      }),
    };
  }
}
export type OpenUIApi = ApiFromModules<{ openui: ReturnType<OpenUI["api"]> }>["openui"];
export type { UIState, StateDoc } from "./validators.js";
export { encodeState, decodeState } from "./serialization.js";
