import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/api/puzzle": {
        target: "https://yokaiba.scheimann.workers.dev",
        changeOrigin: true,
        rewrite: path => {
          const url = new URL(path, "http://localhost");
          const seed = url.searchParams.get("seed") ?? "";
          const templateId = url.searchParams.get("templateId") ?? "tournament-order-v1";
          const parameters = new URLSearchParams({ templateId, seed });
          const difficultyLevel = url.searchParams.get("difficultyLevel");
          if (difficultyLevel) parameters.set("difficultyLevel", difficultyLevel);
          return `/v1/puzzles/generate?${parameters}`;
        },
      },
    },
  },
});
