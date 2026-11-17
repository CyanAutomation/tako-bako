import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:5174";
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "simulator-gameplay.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  outputDir: "test-results/simulator",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
  },
  projects: [{ name: "chromium-simulator", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev:sim",
    url: baseURL,
    env: {
      TAKO_BAKO_SIMULATOR_PORT: "4175",
      TAKO_BAKO_SIMULATOR_APP_PORT: "5174",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
