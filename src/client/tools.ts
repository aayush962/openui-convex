import type { FunctionReference } from "convex/server";
import type { ConvexReactClient } from "convex/react";
import type { ToolSpec } from "@openuidev/lang-core";
import { z } from "zod";

export type ToolDef = {
  description: string;
  input: z.ZodType;
  output?: z.ZodType;
} & (
  | { kind: "query"; ref: FunctionReference<"query", "public"> }
  | { kind: "mutation"; ref: FunctionReference<"mutation", "public"> }
);
export type ToolClient = Pick<ConvexReactClient, "query" | "mutation">;
export type ToolProviderMap = Record<string, (args: Record<string, unknown>) => Promise<unknown>>;
export type ConvexTools = ReturnType<typeof defineConvexTools>;

/** A developer-authored allowlist; model output never resolves arbitrary Convex paths. */
export function defineConvexTools<T extends Record<string, ToolDef>>(definitions: T) {
  const defs = Object.freeze({ ...definitions });
  for (const name of Object.keys(defs)) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || ["constructor", "prototype", "__proto__", "callTool"].includes(name)) {
      throw new Error(`Invalid or reserved tool name: ${name}`);
    }
  }
  return {
    defs,
    toToolSpecs(): ToolSpec[] {
      return Object.entries(defs).map(([name, d]) => ({
        name, description: d.description,
        inputSchema: z.toJSONSchema(d.input),
        // ToolSpec requires outputSchema; {} is the JSON Schema that accepts anything.
        outputSchema: d.output ? z.toJSONSchema(d.output) : {},
      }));
    },
    toToolProvider(client: ToolClient): ToolProviderMap {
      // No inherited names (e.g. toString) may become callable tools.
      const map = Object.create(null) as ToolProviderMap;
      for (const [name, d] of Object.entries(defs)) {
        map[name] = async args => {
          const input: unknown = await d.input.parseAsync(args ?? {});
          if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`Tool ${name} requires object arguments`);
          const output: unknown = d.kind === "query"
            ? await client.query(d.ref, input as Record<string, unknown>)
            : await client.mutation(d.ref, input as Record<string, unknown>);
          return d.output ? d.output.parseAsync(output) : output;
        };
      }
      return Object.freeze(map);
    },
  };
}
