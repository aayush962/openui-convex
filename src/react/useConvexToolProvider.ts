import { useMemo } from "react";
import { useConvex } from "convex/react";
import type { ConvexTools } from "../client/tools.js";
export function useConvexToolProvider(tools: ConvexTools) {
  const client = useConvex();
  return useMemo(() => tools.toToolProvider(client), [client, tools]);
}
