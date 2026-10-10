import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  css: {
    modules: {
      // Stable, readable class names in devtools and in diffs. Without this the
      // default hash changes whenever any file's content changes, which makes
      // CSS-only commits noisy.
      generateScopedName: "[name]__[local]___[hash:base64:5]",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      // desktop/shared/opts-spec.json lives above the Vite root.
      allow: [".."],
    },
  },
});
