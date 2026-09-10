import { OpenUI } from "openui-convex";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { authorizeThreadAccess } from "./chat";

export const openui = new OpenUI(components.openui);
export const { listState, setState, clearState, recordAction, listActions } = openui.api<DataModel>({
  checkRead: (ctx, threadId) => authorizeThreadAccess(ctx, threadId),
  checkWrite: (ctx, threadId) => authorizeThreadAccess(ctx, threadId),
});
