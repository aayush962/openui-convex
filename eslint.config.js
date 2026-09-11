import js from "@eslint/js";
import ts from "typescript-eslint";
import globals from "globals";
import convex from "@convex-dev/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";

export default ts.config(
  { ignores: ["dist/**", "example/dist/**", "**/_generated/**", "example/convex/generated/**", "node_modules/**"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...convex.configs.recommended,
  // Type-aware rules need the project that owns each file.
  {
    files: ["src/**/*.{ts,tsx}", "example/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./example/tsconfig.json", "./example/convex/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Convex runtime code: a worker environment, React-free, no dropped promises.
  {
    files: ["src/**/*.{ts,tsx}", "example/convex/**/*.ts"],
    ignores: ["src/react/**"],
    languageOptions: { globals: globals.worker },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "no-restricted-imports": ["error", { patterns: [
        { group: ["react", "react/*", "react-dom", "react-dom/*", "@openuidev/react-*", "@openuidev/react-*/*"], message: "Convex server code must stay React-free." },
      ] }],
    },
  },
  // React code: browser environment plus the hooks rules.
  {
    files: ["src/react/**/*.{ts,tsx}", "example/src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  { files: ["scripts/**/*.mjs", "*.config.{js,ts}", "example/*.config.ts"], languageOptions: { globals: globals.node } },
);
