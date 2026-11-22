import { expect, type Locator, type Page } from "@playwright/test";
import { runLocalSql } from "../scripts/db-demo.mjs";

/**
 * Wspólne lokatory i kroki scenariuszy e2e. Wyłącznie role / etykiety / tekst —
 * strony nie mają `data-testid` i mają go nie potrzebować (test-plan §6.3).
 */

/**
 * Ośrodek z seeda używany przez oba scenariusze (jutro: 10–16, Bella + Kasztan; Joanna Wrona
 * z 1 miejscem w każdej godzinie, Karol Jasny bez grafiku).
 */
export const STABLE_NAME = "Stadnina Pod Dębem";
/** Hasło wszystkich kont z seeda i kont zakładanych przez setup. */
export const PASSWORD = "sekret123";
export const STABLE_EMAIL = "osrodek.debem@example.com";
/**
 * Instruktorka z kontem z seeda (nie właścicielka) w Stadninie Pod Dębem — „Moje sloty” (#72).
 * Jutro 1 miejsce w każdej godzinie 10–15; Anna Kowalska zapisana o 11 bez konia.
 */
export const INSTRUCTOR_EMAIL = "joanna.wrona@example.com";

export const AUTH_DIR = "playwright/.auth";
export const RIDER_A_STATE = `${AUTH_DIR}/rider-a.json`;
export const RIDER_B_STATE = `${AUTH_DIR}/rider-b.json`;
export const STABLE_STATE = `${AUTH_DIR}/stable.json`;

/**
 * Imiona jeźdźców zakładanych przez setup. Stałe, a nie wartość zwracana z setupu:
 * projekt `setup` i projekty scenariuszy to osobne uruchomienia, które dzielą tylko
 * pliki na dysku, a stan sesji niesie ciasteczka, nie imię. Scenariusz asercjonuje
 * imię na liście „Zapisy dnia" ośrodka (FR-005), więc musi je znać z tego samego źródła.
 * Celowo różne od imion z seeda — `supabase/tests/rls_isolation.sql` wyszukuje
 * jeźdźców po `full_name`, więc kolizja dałaby tam dwa wiersze zamiast jednego.
 */
export const RIDER_A_NAME = "Alicja E2E";
export const RIDER_B_NAME = "Bartek E2E";

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
 * Logowanie przez prawdziwy formularz w świeżym kontekście — dla scenariuszy, które grają drugą
 * osobą obok sesji z `storageState`. Czeka na trasę startową konta (`home`, np. `/instruktor`).
 */
export async function signIn(page: Page, email: string, home: string): Promise<void> {
  await page.goto("/auth/signin");
  await waitForIslands(page);
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL(`**${home}`);
}

/**
 * Sekcja godziny na stronie ośrodka (lista „Wolne sloty") albo wiersz godziny na
 * liście „Zapisy dnia" ośrodka. Godzina siedzi we własnym elemencie, więc zawężamy do
 * `<li>` z dokładnym tekstem godziny („1:00" jest podciągiem „11:00" — stąd `exact`).
 * Na stronie ośrodka pasuje tylko zewnętrzny `<li>` godziny: sloty instruktorów to
 * zagnieżdżone `<li>` bez osobnego elementu z godziną.
 */
export function hourSection(page: Page, hour: number): Locator {
  return page.getByRole("listitem").filter({ has: page.getByText(`${String(hour)}:00`, { exact: true }) });
}

/** Slot instruktora w danej godzinie na stronie ośrodka: nazwa, wolne miejsca, akcja albo stan. */
export function slotItem(page: Page, hour: number, instructor: string): Locator {
  return hourSection(page, hour).getByRole("listitem").filter({ hasText: instructor });
}

/** Przycisk „Zapisz się" w slocie instruktora o danej godzinie. */
export function bookButton(page: Page, hour: number, instructor: string): Locator {
  return slotItem(page, hour, instructor).getByRole("button", { name: "Zapisz się", exact: true });
}

/**
 * Wiersz zapisu na liście „Zapisy dnia" ośrodka w sekcji „Aktywne" albo „Odwołane"
 * (`<section>` z nagłówkiem = region). Sekcja jest konieczna: ten sam slot bywa w obu.
 */
export function dayBookingRow(page: Page, section: "Aktywne" | "Odwołane", hour: number, instructor: string): Locator {
  return page
    .getByRole("region", { name: section, exact: true })
    .getByRole("listitem")
    .filter({ has: page.getByText(`${String(hour)}:00`, { exact: true }) })
    .filter({ hasText: instructor });
}

/** Nadchodzący zapis w „Moje zapisy" — wiersz z przyciskiem „Odwołaj". */
export function upcomingRow(page: Page, stable: string, instructor: string): Locator {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: "Odwołaj" }) })
    .filter({ hasText: stable })
    .filter({ hasText: instructor });
}

/** Wiersz w „Minione i odwołane" oznaczony jako odwołany. */
export function cancelledRow(page: Page, stable: string, instructor: string): Locator {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByText("odwołany", { exact: true }) })
    .filter({ hasText: stable })
    .filter({ hasText: instructor });
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
  await expect(page.getByText("Ośrodek nie wystawił miejsc na ten dzień."), SEED_HINT).toHaveCount(0);
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

/**
 * Świeży właściciel przez prawdziwe formularze: rejestracja z wyborem „Ośrodek”, potem
 * założenie stadniny z domyślną nazwą instruktora (imię i nazwisko). Własny ośrodek per
 * uruchomienie — scenariusz nie zostawia instruktorów ani zaproszeń w ośrodku z seeda.
 */
export async function signUpOwnerWithStable(page: Page, fullName: string, email: string): Promise<void> {
  await page.goto("/auth/signup");
  await waitForIslands(page);
  await page.getByRole("radio", { name: "Ośrodek" }).check();
  await page.getByLabel("Imię i nazwisko").fill(fullName);
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Powtórz hasło").fill(PASSWORD);
  await page.getByRole("button", { name: "Załóż konto" }).click();
  await page.waitForURL("**/osrodek/nowa-stadnina");

  await waitForIslands(page);
  await page.getByLabel("Nazwa stadniny").fill(`Ośrodek ${fullName}`);
  await page.getByLabel("Miejscowość").fill("Testowo");
  await page.getByRole("button", { name: "Załóż stadninę" }).click();
  await page.waitForURL("**/osrodek");
}

// ---------------------------------------------------------------------------
// Rozliczenia (spec #93): `settlements-*.spec.ts`
// ---------------------------------------------------------------------------

export const SETTLEMENTS_ROUTE = "/osrodek/rozliczenia";
/** Adres rozliczenia jeźdźca po kliknięciu wiersza listy: konto w ścieżce, miesiąc w adresie. */
export const RIDER_SETTLEMENT_URL = /\/osrodek\/rozliczenia\/[0-9a-f-]{36}\?miesiac=\d{4}-\d{2}$/;
export const DEMO_HINT = "Brak minionej historii demo — uruchom: npm run db:demo";

/** SQL jako superuser na lokalnej bazie; `what` dokańcza komunikat „Nie udało się …”. Zwraca wyjście psql. */
export function runSql(sql: string, what: string, extraFlags: string[] = []): string {
  const result = runLocalSql(sql, extraFlags);
  if (result.status !== 0) {
    throw new Error(`Nie udało się ${what}:\n${result.stderr}`);
  }
  return result.stdout;
}

/**
 * Usuwa stawki ośrodka z seeda (także indywidualne), a z `costs` — również koszty dodatkowe ośrodka. Obowiązującej
 * zmiany stawki nie usunie nikt poza superuserem z wyłączonymi wyzwalaczami (`session_replication_role =
 * replica`), bo reguła czasu SB027 dotyczy także jego. Specyfikacje biegną po kolei — każda zostawia bazę bez nich.
 */
function clearSettlementData(costs: boolean): void {
  runSql(
    `
    begin;
    set local session_replication_role = replica;
    delete from public.rates r using public.stables s where s.id = r.stable_id and s.name = '${STABLE_NAME}';
    ${costs ? `delete from public.extra_costs c using public.stables s where s.id = c.stable_id and s.name = '${STABLE_NAME}';` : ""}
    commit;
  `,
    costs ? "usunąć stawek i kosztów dodatkowych ośrodka" : "usunąć stawek ośrodka",
  );
}

export function clearStableRates(): void {
  clearSettlementData(false);
}

export function clearStableRatesAndCosts(): void {
  clearSettlementData(true);
}

/** Stawka ośrodka z seeda od bieżącego miesiąca bazy (`private.warsaw_month_start()` — ten sam co aplikacji). */
export function setStableRate(amount: number): void {
  runSql(
    `
    insert into public.rates (stable_id, rider_id, from_month, amount)
    select s.id, null, private.warsaw_month_start(), ${String(amount)} from public.stables s where s.name = '${STABLE_NAME}';
  `,
    "ustawić stawki ośrodka",
  );
}

/** Kwota z tekstu, np. `1 234,50 zł` (twarde spacje), w groszach. */
export function grosze(text: string): number {
  const match = /(\d[\d\s]*),(\d{2})\s*zł/.exec(text);
  if (!match) throw new Error(`Brak kwoty w „${text}”`);
  return Number(match[1].replace(/\s/g, "")) * 100 + Number(match[2]);
}

/** Wiersze listy „Rozliczenia jeźdźców” — jeden `listitem` na jeźdźca. */
export function settlementRiders(page: Page): Locator {
  return page.getByRole("list", { name: "Rozliczenia jeźdźców" }).getByRole("listitem");
}

/** Karty listy: tekst, liczba jazd i „Do zapłaty” — pierwsza kwota karty (`null` — bez kwoty, ośrodek bez stawki). */
export async function settlementRows(page: Page): Promise<{ text: string; rides: number; amount: number | null }[]> {
  return (await settlementRiders(page).allInnerTexts()).map((text) => ({
    text,
    rides: Number(/(\d+) jazd/.exec(text)?.[1] ?? Number.NaN),
    amount: text.includes("zł") ? grosze(text) : null,
  }));
}

/** Wiersze listy ośrodka ze stawką — każdy musi mieć kwotę. */
export async function pricedSettlementRows(page: Page): Promise<{ text: string; rides: number; amount: number }[]> {
  return (await settlementRows(page)).map((row) => ({ ...row, amount: grosze(row.text) }));
}

/** Stan pusty listy: „W październiku 2026 nie ma nic do rozliczenia.” */
export function emptySettlementsMonth(page: Page): Locator {
  return page.getByText(/^We? .+ nie ma nic do rozliczenia\.$/);
}

/** Karta rozliczenia jeźdźca: region „Rozliczenie za {miesiąc}”. */
export function settlementCard(page: Page): Locator {
  return page.getByRole("region", { name: /^Rozliczenie za / });
}

/**
 * Pełna lista jazd rozliczenia jeźdźca (#109): rozwija zwiniętą sekcję „Pokaż wszystkie jazdy (N)” i zwraca
 * listę „Jazdy — {jeździec}” (bez nazwy — listę jazd dowolnego jeźdźca). W miesiącu bez jazd sekcji nie ma.
 */
export async function showAllRides(page: Page, rider?: string): Promise<Locator> {
  const list = page.getByRole("list", { name: rider === undefined ? /^Jazdy — / : `Jazdy — ${rider}` });
  await expect(list, "lista jazd jest domyślnie zwinięta").toBeHidden();
  await page.getByText(/^Pokaż wszystkie jazdy \(\d+\)$/).click();
  await expect(list).toBeVisible();
  return list;
}

/** Koszty dodatkowe w rozliczeniu jeźdźca: region „Koszty dodatkowe” z listą kosztów i formularzami. */
export function riderCostsRegion(page: Page): Locator {
  return page.getByRole("region", { name: "Koszty dodatkowe" });
}

/** Kalendarz miesiąca w rozliczeniu jeźdźca (#110): region „Kalendarz”. */
export function riderCalendar(page: Page): Locator {
  return page.getByRole("region", { name: "Kalendarz", exact: true });
}

/** Zestawienie „Z kim i na czym” w rozliczeniu jeźdźca (#110). */
export function riderBreakdown(page: Page): Locator {
  return page.getByRole("region", { name: "Z kim i na czym", exact: true });
}

/**
 * Dni kalendarza z jazdami (#110): linki o nazwie „3 listopada: 4 jazdy” — opis, liczba jazd (widoczna
 * w polu) i adres zapisów dnia.
 */
export async function calendarRideDays(page: Page): Promise<{ label: string; rides: number; href: string }[]> {
  const links = riderCalendar(page).getByRole("link");
  const days = [];
  for (const link of await links.all()) {
    const label = (await link.getAttribute("aria-label")) ?? "";
    const rides = Number(/: (\d+) jazd/.exec(label)?.[1] ?? Number.NaN);
    await expect(link, `liczba jazd widoczna w polu „${label}”`).toContainText(String(rides));
    days.push({ label, rides, href: (await link.getAttribute("href")) ?? "" });
  }
  return days;
}

/** Nagłówek zwiniętej sekcji „Pozostali jeźdźcy ośrodka” (#106) — kliknięcie ją rozwija. */
export function otherRidersToggle(page: Page): Locator {
  return page.getByText("Pozostali jeźdźcy ośrodka", { exact: true });
}

/** Rozwinięta lista „Pozostali jeźdźcy ośrodka”: jedna pozycja na jeźdźca z linkiem „Dopisz koszt →”. */
export function otherRiders(page: Page): Locator {
  return page.getByRole("list", { name: "Pozostali jeźdźcy ośrodka" }).getByRole("listitem");
}
