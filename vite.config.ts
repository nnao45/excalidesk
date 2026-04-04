import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  // Renderer source is in src/renderer/
  root: "src/renderer",
  build: {
    // Output relative to root -> project_root/dist
    outDir: "../../dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          excalidraw: ["@excalidraw/excalidraw"],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@renderer": resolve("src/renderer/src"),
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "development"),
  },
});
