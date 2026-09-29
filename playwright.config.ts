import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
/** Local server for the "check a link" tests (tests/fixture-server.mjs). */
export const FIXTURE_ORIGIN = "http://127.0.0.1:3199";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/fixture-server.mjs",
      url: `${FIXTURE_ORIGIN}/page.html`,
      env: { FIXTURE_PORT: "3199" },
      reuseExistingServer: !process.env.CI,
    },
    {
      // Self-hosts the TrustMark models so the watermark tests don't depend on Adobe's server at runtime.
      command: `npm run trustmark:models && npm run build && npx next start -p ${PORT}`,
      url: `http://127.0.0.1:${PORT}`,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      env: {
        // The link fetcher refuses private addresses; allow only the local fixture server.
        MEDIA_FETCH_ALLOW_HOSTS: "127.0.0.1:3199",
        NEXT_PUBLIC_TRUSTMARK_MODEL_BASE: "/trustmark/",
        // Lets Node's fetch use HTTPS_PROXY where one is configured; no effect otherwise.
        NODE_USE_ENV_PROXY: "1",
      },
    },
  ],
});
