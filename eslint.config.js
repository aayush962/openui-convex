import js from "@eslint/js";
import ts from "typescript-eslint";
import globals from "globals";
import convex from "@convex-dev/eslint-plugin";
export default ts.config(
  { ignores: ["dist/**", "example/dist/**", "**/_generated/**", "example/convex/generated/**", "node_modules/**"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...convex.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    files: ["src/component/**/*.ts", "example/convex/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        { group: ["react", "react/*", "react-dom", "react-dom/*", "@openuidev/react-*", "@openuidev/react-*/*"], message: "Convex server code must stay React-free." }
      ] }]
    }
  }
);
