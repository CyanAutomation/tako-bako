import { defineConfig, type ProxyOptions } from "vite";
import { DEFAULT_SCENARIO_ID } from "./src/scenarios.ts";
import { yokaibaGenerateParams, YOKAIBA_GENERATE_URL, YOKAIBA_ORIGIN } from "./src/yokaiba.ts";

export default defineConfig(({ mode }) => {
  const proxy: Record<string, ProxyOptions> = mode === "simulator"
    ? {
      "/api": {
        target: `http://127.0.0.1:${process.env.TAKO_BAKO_SIMULATOR_PORT ?? "4174"}`,
        changeOrigin: false,
      },
    }
    : {
      "/api/puzzle": {
        target: YOKAIBA_ORIGIN,
        changeOrigin: true,
        rewrite: path => {
          const url = new URL(path, "http://localhost");
          const seed = url.searchParams.get("seed") ?? "";
          const templateId = url.searchParams.get("templateId") ?? DEFAULT_SCENARIO_ID;
          const difficultyModel = url.searchParams.get("difficultyModel");
          return `${YOKAIBA_GENERATE_URL}?${yokaibaGenerateParams(templateId, seed, url.searchParams.get("difficultyLevel") ?? undefined, difficultyModel === "v5" || difficultyModel === "compare" ? difficultyModel : undefined)}`;
        },
      },
    };

  return {
    server: {
      proxy,
    },
  };
});
