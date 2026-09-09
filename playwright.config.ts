import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Suita zakłada konta testowe (hasło `sekret123`) i robi prawdziwe zapisy, więc
 * nie wolno jej puścić na zdalny projekt Supabase. Cel bierze się wyłącznie
 * z `.dev.vars` (snapshot przy buildzie), dlatego to ten plik jest sprawdzany —
 * tak jak `supabase/tests/_psql.sh` odmawia hosta innego niż localhost, chyba że
 * `E2E_ALLOW_REMOTE=1` mówi wprost, że wiesz, co robisz.
 */
function assertLocalSupabaseTarget(): void {
  if (process.env.E2E_ALLOW_REMOTE === "1") {
    return;
  }
  if (!existsSync(".dev.vars")) {
    throw new Error(
      "Brak .dev.vars — wskaż lokalny stack Supabase (SUPABASE_URL=http://127.0.0.1:54321) przed testami e2e.",
    );
  }
  const line = readFileSync(".dev.vars", "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("SUPABASE_URL="));
  const url =
    line
      ?.slice("SUPABASE_URL=".length)
      .trim()
      .replace(/^["']|["']$/g, "") ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `Testy e2e odmawiają celu spoza localhost (SUPABASE_URL w .dev.vars: "${url || "(brak)"}"). ` +
        "Wskaż lokalny stack albo ustaw E2E_ALLOW_REMOTE=1, jeśli naprawdę chcesz zapisywać na zdalnym projekcie.",
    );
  }
}

assertLocalSupabaseTarget();

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
 *
 * Port 4173 jest dedykowany dla tej suity: `reuseExistingServer` lokalnie
 * podłączyłby się do czegokolwiek na domyślnym 4321 (`astro dev` albo stary
 * preview zbudowany z innym `.dev.vars`), a to unieważnia gwarancję snapshotu.
 */
const PORT = 4173;
const BASE_URL = `http://localhost:${String(PORT)}`;

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
    command: `npm run build && npm run preview -- --port ${String(PORT)}`,
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
