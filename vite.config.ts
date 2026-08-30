import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/api/puzzle": {
        target: "https://yokaiba.scheimann.workers.dev",
        changeOrigin: true,
        rewrite: path => {
          const seed = path.replace("/api/puzzle/", "");
          return `/v1/puzzles/generate?${new URLSearchParams({ templateId: "tournament-order-v1", seed })}`;
        },
      },
    },
  },
});
