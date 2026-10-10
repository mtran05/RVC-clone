// Tests cover the Electron main process, the shared option spec, and the
// renderer's pure logic. Every target is plain data in, plain data out, so the
// default node environment is enough; only the render smoke test opts into jsdom
// with a `@vitest-environment` comment.
//
// The renderer is an npm workspace, so React, react-dom, and the router resolve
// to one hoisted copy and this config needs no aliases.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{js,mjs}", "renderer/src/**/*.test.{ts,tsx}"],
  },
});
