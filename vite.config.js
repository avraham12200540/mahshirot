import { defineConfig } from "vite";

export default defineConfig({
  // Relative base keeps the build portable: GitHub Pages project sites,
  // user sites, or any static host serve it without rebuilding.
  base: "./",
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    open: true,
  },
});
