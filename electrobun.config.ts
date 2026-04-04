import type { ElectrobunConfig } from "electrobun/bun";

export default {
  app: {
    name: "excalidesk",
    identifier: "com.nnao45.excalidesk",
    version: "0.1.1",
  },
  build: {
    // Copy Vite build output to the views directory used by Electrobun
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
    },
    // Don't watch the dist directory since Vite HMR handles view updates
    watchIgnore: ["dist"],
    // Use system webview (no CEF bundling) for smaller bundle size
    mac: { bundleCEF: false },
    linux: { bundleCEF: false },
    win: { bundleCEF: false },
  },
} satisfies ElectrobunConfig;
