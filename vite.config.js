import { defineConfig } from "vite";

export default defineConfig({
  // הגדרת ה-base לשם המאגר בגיטהאב כדי שהנתיבים יעבדו נכון
  base: "/mahshirot/",
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
