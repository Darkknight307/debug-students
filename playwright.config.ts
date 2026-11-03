import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright (#56): нақты браузер тесттері Docker Compose стегіне қарсы (compose.yml + compose.e2e.yml, Postgres).
 *   npm run test:pw:compose   — стекті құрастырып көтереді, барлық spec-ті жүргізеді, стекті өшіреді
 *   npm run test:pw           — қазір жүріп тұрған стекке (E2E_BASE_URL, әдепкі http://localhost:3300)
 * Әр мүмкіндік — бөлек spec (e2e/features, `e2e-test` issue-лары #69–#83), стек деңгейі — e2e/integration.
 */
const DESKTOP_ONLY = ["**/13-admin-task-editor.spec.ts", "**/14-admin-operator.spec.ts", "**/15-admin-analysis.spec.ts"];

export default defineConfig({
  testDir: "e2e",
  // Spec-тер бір дерекқорды бөліседі және әр тест оны тазартады — қатар жүрмейді
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3300",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    timezoneId: "Asia/Almaty",
    reducedMotion: "reduce",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    {
      name: "mobile",
      testIgnore: DESKTOP_ONLY,
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
  ],
});
