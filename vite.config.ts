import { defineConfig } from "vite";
import { DEFAULT_SCENARIO_ID } from "./src/scenarios.ts";
import { yokaibaGenerateParams, YOKAIBA_GENERATE_URL, YOKAIBA_ORIGIN } from "./src/yokaiba.ts";

export default defineConfig({
  server: {
    proxy: {
      "/api/puzzle": {
        target: YOKAIBA_ORIGIN,
        changeOrigin: true,
        rewrite: path => {
          const url = new URL(path, "http://localhost");
          const seed = url.searchParams.get("seed") ?? "";
          const templateId = url.searchParams.get("templateId") ?? DEFAULT_SCENARIO_ID;
          return `${YOKAIBA_GENERATE_URL}?${yokaibaGenerateParams(templateId, seed, url.searchParams.get("difficultyLevel") ?? undefined)}`;
        },
      },
    },
  },
});