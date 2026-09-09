import { defineConfig, devices } from "@playwright/test";

/**
 * Testy przeglądarkowe pętli jeźdźca (test-plan §3 faza 2, §6.3).
 *
 * Aplikacja stoi na `astro preview` (workerd) zbudowanym z bieżącego `dist/`.
 * Sekrety Supabase czyta zbudowany worker ze snapshotu `dist/server/.dev.vars`,
 * który `astro build` robi z głównego `.dev.vars` — dlatego komenda serwera
 * zawsze buduje, a `.dev.vars` musi wskazywać lokalny stack (`npx supabase
 * start`) ZANIM test ruszy. Zmienne środowiskowe procesu nie docierają do
 * workera, więc `webServer.env` nic by tu nie dało.
 *
 * Jeden worker i brak równoległości są celowe: dwa scenariusze dzielą jeden
 * seed (Stadnina Pod Debem, jutro), a każdy z nich rezerwuje inny slot.
 */
const BASE_URL = "http://localhost:4321";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    locale: "pl-PL",
    timezoneId: "Europe/Warsaw",
  },
  webServer: {
    command: "npm run build && npm run preview",
    url: BASE_URL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
});
