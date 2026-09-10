import { v, type Infer } from "convex/values";

export const vState = v.record(v.string(), v.any());
export const vStateDoc = v.object({ messageId: v.string(), state: vState, version: v.number() });
export const stateKey = { scopeKey: v.string(), messageId: v.string() };
export const stateSetArgs = { ...stateKey, state: vState, clientVersion: v.optional(v.number()) };
export const stateClearArgs = { scopeKey: v.string(), messageId: v.optional(v.string()) };
export const actionRecordArgs = {
  ...stateKey,
  type: v.string(),
  params: v.any(),
  formName: v.optional(v.string()),
  formState: v.optional(v.any()),
  humanFriendlyMessage: v.optional(v.string()),
};
export const vActionEvent = v.object({ ...actionRecordArgs, _id: v.string(), _creationTime: v.number(), createdAt: v.number() });
export const vActionPage = v.object({ page: v.array(vActionEvent), isDone: v.boolean(), continueCursor: v.string(), splitCursor: v.optional(v.union(v.string(), v.null())), pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())) });
export type UIState = Infer<typeof vState>;
export type StateDoc = Infer<typeof vStateDoc>;
export type ActionRecordArgs = Infer<ReturnType<typeof actionValidator>>;
function actionValidator() { return v.object(actionRecordArgs); }
