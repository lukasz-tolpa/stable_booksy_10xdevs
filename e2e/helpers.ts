import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Wspólne lokatory i kroki scenariuszy e2e. Wyłącznie role / etykiety / tekst —
 * strony nie mają `data-testid` i mają go nie potrzebować (test-plan §6.3).
 */

/** Ośrodek z seeda używany przez oba scenariusze (jutro: 10–16, Bella + Kasztan). */
export const STABLE_NAME = "Stadnina Pod Debem";
/** Hasło wszystkich kont z seeda i kont zakładanych przez setup. */
export const PASSWORD = "sekret123";
export const STABLE_EMAIL = "osrodek.debem@example.com";

export const AUTH_DIR = "playwright/.auth";
export const RIDER_A_STATE = `${AUTH_DIR}/rider-a.json`;
export const RIDER_B_STATE = `${AUTH_DIR}/rider-b.json`;
export const STABLE_STATE = `${AUTH_DIR}/stable.json`;

export const SEED_HINT = "Seed nieaktualny albo stack nie działa — uruchom: npx supabase db reset";

/** Rzucona wartość jako `Error` — reguła `only-throw-error` przy ponownym rzucie po sprzątaniu. */
export function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * Formularze logowania i rejestracji to wyspy React z kontrolowanymi polami.
 * `fill` wykonany przed hydracją zostaje nadpisany pustym stanem Reacta, gdy
 * wyspa się hydratuje — pole „wypełnia się", po czym znika. Astro zdejmuje
 * atrybut `ssr` z `<astro-island>` dokładnie po hydracji, więc czekamy na to,
 * zamiast na czas albo na `networkidle`.
 */
export async function waitForIslands(page: Page): Promise<void> {
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}

/**
 * Sekcja godziny na stronie ośrodka (lista „Wolne sloty") albo wiersz godziny na
 * liście „Zapisy dnia" ośrodka. Przycisk zapisu nazywa się wyłącznie imieniem
 * konia, a godzina siedzi w sąsiednim akapicie, więc najpierw zawężamy do `<li>`
 * z dokładnym tekstem godziny („1:00" jest podciągiem „11:00" — stąd `exact`).
 */
export function hourSection(page: Page, hour: number): Locator {
  return page.getByRole("listitem").filter({ has: page.getByText(`${String(hour)}:00`, { exact: true }) });
}

/** Przycisk zapisu na konia w danej godzinie. */
export function bookButton(page: Page, hour: number, horse: string): Locator {
  return hourSection(page, hour).getByRole("button", { name: horse, exact: true });
}

/** Nadchodzący zapis w „Moje zapisy" — wiersz z przyciskiem „Odwołaj". */
export function upcomingRow(page: Page, stable: string, horse: string): Locator {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: "Odwołaj" }) })
    .filter({ hasText: stable })
    .filter({ hasText: horse });
}

/** Wiersz w „Minione i odwołane" oznaczony jako odwołany. */
export function cancelledRow(page: Page, stable: string, horse: string): Locator {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByText("odwołany", { exact: true }) })
    .filter({ hasText: stable })
    .filter({ hasText: horse });
}

/**
 * Guard świeżości seeda: dni grafiku w seedzie to `current_date + 1` z chwili
 * załadowania, a strona ośrodka domyślnie pokazuje jutro. Po dobie bez `db reset`
 * jutro nie ma grafiku i każdy scenariusz padłby z niejasnym powodem — tu pada
 * z tą samą podpowiedzią, którą daje `npm run test:db`.
 */
export async function assertSlotsRendered(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 2, name: "Wolne sloty" })).toBeVisible();
  await expect(page.getByText("Ośrodek nie ułożył grafiku na ten dzień."), SEED_HINT).toHaveCount(0);
  await expect(
    page
      .getByRole("listitem")
      .filter({ has: page.getByRole("button") })
      .first(),
    SEED_HINT,
  ).toBeVisible();
}

export interface OpenedStable {
  /** Ścieżka strony ośrodka bez query — do powrotu z jawnym `?dzien=`. */
  path: string;
  /** Dzień z grafikiem w seedzie (jutro wg reguły seeda), ISO `YYYY-MM-DD`. */
  day: string;
}

/**
 * Dzień, na który seed układa grafik: `current_date + 1` liczone w strefie
 * kontenera Postgresa (UTC). Strona ośrodka domyślnie pokazuje jutro w
 * Europe/Warsaw, a to między 22:00 a 24:00 UTC jest o dzień dalej niż dzień
 * seeda — test nie może więc polegać na domyślnym dniu strony i podaje go jawnie.
 * UTC-jutro nigdy nie jest dla aplikacji dniem minionym (Warszawa wyprzedza UTC).
 */
export function seedDay(now: Date = new Date()): string {
  const day = new Date(now);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

/**
 * Z katalogu przez filtr do strony ośrodka, potem jawnie na dzień seeda.
 */
export async function openStable(page: Page, name: string): Promise<OpenedStable> {
  await page.goto("/jezdziec");
  await expect(page.getByRole("heading", { level: 1, name: "Ośrodki" })).toBeVisible();
  await page.getByLabel("Szukaj ośrodka").fill(name);
  await page.getByRole("button", { name: "Szukaj" }).click();
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  const path = new URL(page.url()).pathname;
  const day = seedDay();
  await page.goto(`${path}?dzien=${day}`);
  await expect(page.getByLabel("Wybierz dzień")).toHaveValue(day);
  await assertSlotsRendered(page);

  return { path, day };
}
