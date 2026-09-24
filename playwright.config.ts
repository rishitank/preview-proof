import { defineConfig, devices } from "@playwright/test";

const port = 5199;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    // Optional: point at a preinstalled Chromium instead of `playwright install`.
    launchOptions: process.env["PW_CHROMIUM_PATH"]
      ? { executablePath: process.env["PW_CHROMIUM_PATH"] }
      : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  ...(process.env["E2E_BASE_URL"]
    ? {}
    : {
        webServer: {
          command: `bunx vite dev --host 127.0.0.1 --port ${port} --strictPort`,
          url: `http://127.0.0.1:${port}`,
          reuseExistingServer: !process.env["CI"],
          env: { PREVIEWPROOF_FAKE_NET: "1" },
          timeout: 60_000,
        },
      }),
});
