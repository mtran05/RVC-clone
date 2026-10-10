import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// One config for the whole desktop/ tree: the Electron main process, the shared
// spec, the test files, and the React renderer.
export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "renderer/dist/**"],
  },
  js.configs.recommended,
  {
    // The renderer and its tests are TypeScript / TSX.
    files: ["renderer/src/**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Props interfaces are declared inline throughout; this codebase reads
      // better with plain types than with exported interface declarations.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Main-process and test files are plain CommonJS JavaScript.
    files: ["*.js", "main/**/*.js", "tests/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "writable",
        process: "readonly",
        __dirname: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
