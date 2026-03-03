import { defineConfig } from "@playwright/test";

const baseURL = process.env.BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /global-setup\.ts/ },
    {
      name: "smoke",
      use: { browserName: "chromium" },
      testMatch: /smoke\.spec\.ts/,
    },
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        storageState: "./tests/e2e/.auth/user.json",
      },
      dependencies: ["setup"],
      testIgnore: /smoke\.spec\.ts/,
    },
  ],
});
