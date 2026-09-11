import { OpenUI } from "openui-convex";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { authorizeThreadAccess } from "./chat";

export const openui = new OpenUI(components.openui);
// The scope key is the Agent thread id, so thread access doubles as the authorization check.
export const { getState, setState, clearState } = openui.api<DataModel>({
  checkRead: authorizeThreadAccess,
  checkWrite: authorizeThreadAccess,
});
