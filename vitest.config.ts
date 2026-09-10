import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["src/**/*.test.{ts,tsx}", "example/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
    typecheck: { enabled: true, tsconfig: "tsconfig.json" },
    env: { OPENUI_TELEMETRY_DISABLED: "1" }
  }
});
