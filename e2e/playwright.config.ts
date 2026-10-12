import { defineConfig } from "@playwright/test";

// Runs against the .NET server, which serves the engine SDK, the tour config and the demo host apps.
export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  fullyParallel: false,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:5080",
    channel: process.env.PW_CHANNEL ?? "chrome",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "dotnet run --project ../server/GuidedTours.Api --launch-profile http",
        url: "http://localhost:5080/health",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
