import type { ElectrobunConfig } from "electrobun/bun";

export default {
  name: "excalidesk",
  identifier: "com.nnao45.excalidesk",
  version: "0.1.1",
  build: {
    // Copy Vite build output to the views directory used by Electrobun
    copy: [
      { from: "dist/index.html", to: "views/mainview/index.html" },
      { from: "dist/assets", to: "views/mainview/assets" },
    ],
    // Don't watch the dist directory since Vite HMR handles view updates
    watch: {
      ignore: ["dist"],
    },
  },
  // Use system webview (no CEF bundling) for smaller bundle size
  mac: { disableCef: true },
  linux: { disableCef: true },
  win: { disableCef: true },
} satisfies ElectrobunConfig;
