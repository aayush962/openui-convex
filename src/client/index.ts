import {
  type ApiFromModules, type GenericDataModel, type GenericMutationCtx, type GenericQueryCtx,
  mutationGeneric, queryGeneric, paginationOptsValidator,
} from "convex/server";
import { v } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import { actionRecordArgs, stateSetArgs, stateClearArgs, vStateDoc, vActionPage, type ActionRecordArgs, type UIState } from "./validators.js";

export type RunQueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
export type RunMutationCtx = Pick<GenericMutationCtx<GenericDataModel>, "runQuery" | "runMutation">;

/** An isolated state store. All browser access goes through the app's authorization hooks. */
export class OpenUI {
  constructor(public component: ComponentApi) {}
  getState(ctx: RunQueryCtx, args: { scopeKey: string; messageId: string }) {
    return ctx.runQuery(this.component.state.get, args);
  }
  listState(ctx: RunQueryCtx, args: { scopeKey: string }) {
    return ctx.runQuery(this.component.state.listByScope, args);
  }
  setState(ctx: RunMutationCtx, args: { scopeKey: string; messageId: string; state: UIState; clientVersion?: number }) {
    return ctx.runMutation(this.component.state.set, args);
  }
  clearState(ctx: RunMutationCtx, args: { scopeKey: string; messageId?: string }) {
    return ctx.runMutation(this.component.state.clear, args);
  }
  recordAction(ctx: RunMutationCtx, args: ActionRecordArgs) {
    return ctx.runMutation(this.component.actions.record, args);
  }
  /** Re-export in an app module: export const { listState, setState, ... } = openui.api({...}). */
  api<DataModel extends GenericDataModel = GenericDataModel>(opts: {
    checkRead: (ctx: GenericQueryCtx<DataModel>, scopeKey: string) => void | Promise<void>;
    checkWrite: (ctx: GenericMutationCtx<DataModel>, scopeKey: string) => void | Promise<void>;
    onAction?: (ctx: GenericMutationCtx<DataModel>, event: ActionRecordArgs) => void | Promise<void>;
  }) {
    return {
      listState: queryGeneric({
        args: { scopeKey: v.string() }, returns: v.array(vStateDoc),
        handler: async (ctx, args) => {
          await opts.checkRead(ctx, args.scopeKey);
          return this.listState(ctx, args);
        },
      }),
      setState: mutationGeneric({
        args: stateSetArgs, returns: v.object({ version: v.number() }),
        handler: async (ctx, args) => {
          await opts.checkWrite(ctx, args.scopeKey);
          return this.setState(ctx, args);
        },
      }),
      clearState: mutationGeneric({
        args: stateClearArgs, returns: v.null(),
        handler: async (ctx, args) => {
          await opts.checkWrite(ctx, args.scopeKey);
          return this.clearState(ctx, args);
        },
      }),
      recordAction: mutationGeneric({
        args: actionRecordArgs, returns: v.string(),
        handler: async (ctx, args) => {
          await opts.checkWrite(ctx, args.scopeKey);
          await opts.onAction?.(ctx, args);
          return this.recordAction(ctx, args);
        },
      }),
      listActions: queryGeneric({
        args: { scopeKey: v.string(), paginationOpts: paginationOptsValidator }, returns: vActionPage,
        handler: async (ctx, args) => {
          await opts.checkRead(ctx, args.scopeKey);
          return ctx.runQuery(this.component.actions.list, args);
        },
      }),
    };
  }
}
export type OpenUIApi = ApiFromModules<{ openui: ReturnType<OpenUI["api"]> }>["openui"];
export type { ActionRecordArgs, UIState, StateDoc } from "./validators.js";
export * from "./tools.js";
