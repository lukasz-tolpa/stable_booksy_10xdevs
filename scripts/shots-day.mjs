/**
 * Zrzuty do sekcji „Jeden dzień ze Stable Booksy” na stronie głównej (#53).
 *
 * Skrypt ODGRYWA dzień na lokalnej bazie i po każdym kroku robi zrzut właściwego
 * regionu ekranu w dwóch szerokościach (komputer i telefon):
 *
 *   1. ośrodek otwiera grafik dnia seeda        → grafik-*.webp
 *   2. Anna zapisuje się na 11:00               → sloty-*.webp
 *   3. ośrodek przydziela Annie konia           → zapisy-dnia-*.webp
 *   4. Anna otwiera „Moje zapisy”               → moje-zapisy-*.webp
 *   5. ośrodek otwiera statystyki               → statystyki-*.webp
 *
 * Wymaga lokalnego stacka z CZYSTYM seedem, załadowanej historii demo i działającego
 * podglądu aplikacji zbudowanego z `.dev.vars` wskazującym lokalny stack:
 *
 *   npx supabase start && npx supabase db reset && npm run db:demo
 *   npm run build && npm run preview -- --port 4173
 *   npm run shots:day                # albo SHOTS_BASE_URL=... npm run shots:day
 *
 * Skrypt sam bazy nie resetuje. Na początku sprawdza jej stan i przy każdym odstępstwie
 * kończy się komunikatem, nic nie zapisując - drugie uruchomienie bez `db reset`
 * odmawia, bo Anna ma już zapis z koniem.
 *
 * Seed zawiera zapis Anny o 11:00 (bez konia; potrzebują go testy bazy i e2e). Żeby
 * Anna mogła zapisać się w przeglądarce, skrypt usuwa z bazy dokładnie ten jeden
 * nietknięty wiersz - to jedyny zapis poza interfejsem. Dzień bez zapisu Anny też
 * jest poprawnym startem.
 *
 * Wynik: `public/jeden-dzien/<ekran>-<komputer|telefon>.webp`, commitowany razem ze
 * skryptem. Stoi POZA `e2e/` (jak `scripts/shots.mjs`), więc suita go nie zbiera.
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium, expect } from "@playwright/test";
import sharp from "sharp";
import { runLocalSql } from "./db-demo.mjs";

const BASE_URL = process.env.SHOTS_BASE_URL ?? "http://localhost:4173";
const OUT_DIR = path.resolve(import.meta.dirname, "..", "public", "jeden-dzien");
const RESET_HINT = "Przygotuj bazę od nowa: npx supabase db reset && npm run db:demo";

/** Konta z seeda (`supabase/seed.sql`), hasło jak w e2e. */
const PASSWORD = "sekret123";
const RIDER_EMAIL = "anna.kowalska@example.com";
const RIDER_NAME = "Anna Kowalska";
const STABLE_EMAIL = "osrodek.debem@example.com";
const STABLE_NAME = "Stadnina Pod Dębem";

/** Historia: Anna jeździ o 11:00 u jedynej instruktorki dnia seeda, ośrodek daje jej Bellę. */
const HOUR = 11;
const INSTRUCTOR = "Joanna Wrona";
const HORSE = "Bella";

/**
 * Komputer: region ma szerokość kontenera aplikacji (880 px). Telefon: 390 px przy
 * gęstości 2, żeby tekst był ostry po wstawieniu w wąską ramkę na stronie głównej.
 */
const VARIANTS = [
  { name: "komputer", viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
  { name: "telefon", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
];

/** Margines wycinka wokół regionu, w pikselach CSS. */
const PAD = 16;
const WEBP_QUALITY = 82;

/** Błąd stanu wyjściowego - komunikat dla człowieka, bez śladu stosu. */
class PreconditionError extends Error {}

/**
 * Dzień, na który seed układa grafik: `current_date + 1` liczone w UTC (strefa
 * kontenera Postgresa) - ta sama reguła co `scripts/shots.mjs` i `e2e/helpers.ts`.
 * @returns {string} data ISO `YYYY-MM-DD`
 */
function seedDay() {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

/**
 * @typedef {object} StartingState
 * @property {boolean} scheduled czy ośrodek ma grafik na dzień seeda
 * @property {{ id: number, hour: number, status: string, horse: number | null }[]} anna zapisy Anny w tym dniu
 * @property {number} others zapisy innych jeźdźców w tym dniu
 * @property {number} history zapisy ośrodka w dniach minionych (historia demo)
 * @property {number} e2e konta zakładane przez setup e2e
 */

/**
 * Stan bazy przed odegraniem historii. Rzuca `PreconditionError`, gdy dzień seeda
 * nie nadaje się na start; nic nie zapisuje.
 * @param {string} day
 * @returns {number | null} identyfikator nietkniętego zapisu Anny z seeda albo `null`, gdy go nie ma
 */
function checkStartingState(day) {
  const dayBookings = `
    from public.bookings b
    join public.schedule_days d on d.id = b.schedule_day_id
    join public.stables s on s.id = d.stable_id
    where s.name = '${STABLE_NAME}'`;
  const result = runLocalSql(
    `select json_build_object(
       'scheduled', exists (
         select 1 from public.schedule_days d join public.stables s on s.id = d.stable_id
         where s.name = '${STABLE_NAME}' and d.day = '${day}'),
       'anna', coalesce((
         select json_agg(json_build_object('id', b.id, 'hour', b.hour, 'status', b.status, 'horse', b.horse_id))
         ${dayBookings} and d.day = '${day}'
           and b.rider_id = (select id from auth.users where email = '${RIDER_EMAIL}')), '[]'::json),
       'others', (select count(*) ${dayBookings} and d.day = '${day}'
           and b.rider_id is distinct from (select id from auth.users where email = '${RIDER_EMAIL}')),
       'history', (select count(*) ${dayBookings} and d.day < current_date),
       'e2e', (select count(*) from public.profiles where full_name like '% E2E')
     );`,
    ["-At"],
  );
  if (result.status !== 0) {
    throw new PreconditionError(
      `Nie udało się odczytać lokalnej bazy. Czy stack działa (npx supabase start)?\n${result.stderr.trim()}`,
    );
  }

  /** @type {unknown} */
  const parsed = JSON.parse(result.stdout.trim());
  const state = /** @type {StartingState} */ (parsed);

  if (!state.scheduled) {
    throw new PreconditionError(`${STABLE_NAME} nie ma grafiku na ${day} - seed jest nieaktualny. ${RESET_HINT}`);
  }
  if (state.e2e > 0) {
    throw new PreconditionError(`W bazie są konta testowe z e2e - trafiłyby na zrzuty. ${RESET_HINT}`);
  }
  if (state.others > 0) {
    throw new PreconditionError(
      `Dzień ${day} ma zapisy innych jeźdźców niż Anna - to nie jest czysty seed. ${RESET_HINT}`,
    );
  }
  if (state.history === 0) {
    throw new PreconditionError("Brak historii demo - statystyki byłyby puste. Uruchom: npm run db:demo");
  }
  if (state.anna.length === 0) {
    return null;
  }
  const [booking] = state.anna;
  const untouchedSeed =
    state.anna.length === 1 && booking.status === "active" && booking.hour === HOUR && booking.horse === null;
  if (!untouchedSeed) {
    throw new PreconditionError(
      `Dzień ${day} ma już zapis Anny inny niż w czystym seedzie (historia była odgrywana albo dane są zmienione). ${RESET_HINT}`,
    );
  }
  return booking.id;
}

/**
 * Usuwa zapis Anny wstawiony przez seed, żeby mogła zapisać się w przeglądarce.
 * @param {number} bookingId
 */
function removeSeededBooking(bookingId) {
  const result = runLocalSql(`delete from public.bookings where id = ${String(bookingId)};`);
  if (result.status !== 0) {
    throw new Error(`Nie udało się usunąć zapisu Anny z seeda.\n${result.stderr.trim()}`);
  }
}

/**
 * Formularze auth i grafik to wyspy React - Astro zdejmuje `ssr` z `<astro-island>`
 * po hydracji, a pasek narzędzi istnieje tylko na serwerze deweloperskim.
 * @param {import("@playwright/test").Page} page
 */
async function settle(page) {
  await page.waitForSelector("astro-island[ssr]", { state: "detached" });
  await page.addStyleTag({ content: "astro-dev-toolbar { display: none !important; }" });
  await page.evaluate("document.fonts.ready.then(() => true)");
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} email
 */
async function signIn(page, email) {
  await page.goto(`${BASE_URL}/auth/signin`);
  await settle(page);
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL(/\/(jezdziec|osrodek)/);
}

/**
 * Rola = zalogowane konto otwarte w obu wariantach szerokości. Kroki historii klika
 * się w pierwszym wariancie (`actor`), zrzuty robi się we wszystkich.
 * @param {import("@playwright/test").Browser} browser
 * @param {string} email
 */
async function openRole(browser, email) {
  const shared = { locale: "pl-PL", timezoneId: "Europe/Warsaw" };
  const [first, ...rest] = VARIANTS;
  const context = await browser.newContext({ ...shared, ...first });
  const actor = await context.newPage();
  await signIn(actor, email);
  const storageState = await context.storageState();

  const views = [{ variant: first.name, page: actor }];
  for (const variant of rest) {
    const other = await browser.newContext({ ...shared, ...variant, storageState });
    views.push({ variant: variant.name, page: await other.newPage() });
  }
  return { actor, views };
}

/**
 * Wycinek strony: pełna szerokość `<main>`, w pionie od góry `region.from` do dołu
 * `region.to` z marginesem. Górny pasek jest nad `<main>`, więc nigdy nie wchodzi w kadr.
 * @param {{ views: { variant: string, page: import("@playwright/test").Page }[] }} role
 * @param {string} name
 * @param {string} url
 * @param {(page: import("@playwright/test").Page) => Promise<{ from: import("@playwright/test").Locator, to?: import("@playwright/test").Locator }>} region
 */
async function capture(role, name, url, region) {
  for (const { variant, page } of role.views) {
    await page.goto(url);
    await settle(page);
    const { from, to = from } = await region(page);
    // Świeżo wczytana strona nie jest przewinięta, więc prostokąty są we współrzędnych strony.
    const [main, top, bottom] = await Promise.all([
      page.locator("main").boundingBox(),
      from.boundingBox(),
      to.boundingBox(),
    ]);
    if (!main || !top || !bottom) {
      throw new Error(`Zrzut „${name}” (${variant}): region nie jest widoczny na ${url}.`);
    }
    const y = Math.max(0, top.y - PAD);
    const png = await page.screenshot({
      fullPage: true,
      clip: { x: main.x, y, width: main.width, height: bottom.y + bottom.height + PAD - y },
    });
    const file = path.join(OUT_DIR, `${name}-${variant}.webp`);
    const info = await sharp(png).webp({ quality: WEBP_QUALITY }).toFile(file);
    process.stdout.write(
      `${path.relative(process.cwd(), file)}  ${String(info.width)}x${String(info.height)}  ${String(Math.round(info.size / 1024))} KB\n`,
    );
  }
}

/**
 * Wiersz godziny na liście „Wolne sloty” i slot instruktora w nim - jak w `e2e/helpers.ts`.
 * @param {import("@playwright/test").Page} page
 * @param {number} hour
 * @param {string} instructor
 */
function slotItem(page, hour, instructor) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByText(`${String(hour)}:00`, { exact: true }) })
    .getByRole("listitem")
    .filter({ hasText: instructor });
}

/**
 * Wiersz zapisu Anny w sekcji „Aktywne” listy „Zapisy dnia”.
 * @param {import("@playwright/test").Page} page
 */
function dayBookingRow(page) {
  return page
    .getByRole("region", { name: "Aktywne", exact: true })
    .getByRole("listitem")
    .filter({ has: page.getByText(`${String(HOUR)}:00`, { exact: true }) })
    .filter({ hasText: RIDER_NAME });
}

async function playDay() {
  const day = seedDay();
  const seededBookingId = checkStartingState(day);
  if (seededBookingId !== null) {
    removeSeededBooking(seededBookingId);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    const stable = await openRole(browser, STABLE_EMAIL);
    const rider = await openRole(browser, RIDER_EMAIL);

    // 1. Ośrodek otwiera grafik dnia: konie, instruktorzy i arkusz limitów z „Koni zajętych”.
    await capture(stable, "grafik", `${BASE_URL}/osrodek/grafik?dzien=${day}`, async (page) => {
      await expect(page.getByRole("columnheader", { name: "Koni zajętych" })).toBeVisible();
      return { from: page.getByRole("group", { name: /^Konie/ }), to: page.getByRole("table") };
    });

    // 2. Anna zapisuje się na 11:00. Adres ośrodka z katalogu - seed generuje nowe id.
    await rider.actor.goto(`${BASE_URL}/jezdziec`);
    await rider.actor.getByRole("link", { name: STABLE_NAME }).first().click();
    await rider.actor.getByRole("heading", { level: 1, name: STABLE_NAME }).waitFor();
    const slotsUrl = `${BASE_URL}${new URL(rider.actor.url()).pathname}?dzien=${day}`;
    await rider.actor.goto(slotsUrl);
    await slotItem(rider.actor, HOUR, INSTRUCTOR).getByRole("button", { name: "Zapisz się", exact: true }).click();
    await rider.actor.waitForURL(/sukces=1/);
    await capture(rider, "sloty", slotsUrl, async (page) => {
      await expect(slotItem(page, HOUR, INSTRUCTOR)).toContainText("Twój zapis");
      return { from: page.getByRole("heading", { level: 2, name: "Wolne sloty" }).locator("..") };
    });

    // 3. Ośrodek przydziela Annie konia na liście zapisów dnia.
    const dayUrl = `${BASE_URL}/osrodek/zapisy?dzien=${day}`;
    await stable.actor.goto(dayUrl);
    const row = dayBookingRow(stable.actor);
    await row.getByLabel("Koń", { exact: true }).selectOption({ label: HORSE });
    await row.getByRole("button", { name: "Zapisz konia" }).click();
    await stable.actor.waitForURL(/sukces=przydzial/);
    await capture(stable, "zapisy-dnia", dayUrl, async (page) => {
      // Dowód z bazy: po przeładowaniu koń stoi w opisie wiersza, nie tylko w liście wyboru.
      await expect(dayBookingRow(page).getByText(HORSE, { exact: true }).first()).toBeVisible();
      return { from: page.getByRole("region", { name: "Aktywne", exact: true }) };
    });

    // 4. Anna widzi konia przy nadchodzącej jeździe.
    await capture(rider, "moje-zapisy", `${BASE_URL}/jezdziec/zapisy`, async (page) => {
      const upcoming = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { level: 2, name: "Nadchodzące" }) });
      await expect(upcoming.getByRole("listitem").filter({ hasText: INSTRUCTOR })).toContainText(HORSE);
      return { from: upcoming };
    });

    // 5. Ośrodek patrzy w statystyki: podsumowanie okresu i wykres godzin jazd.
    await capture(stable, "statystyki", `${BASE_URL}/osrodek/statystyki`, async (page) => {
      const summary = page.getByRole("region", { name: "Podsumowanie okresu" });
      const chart = page.getByRole("region", { name: "Godziny jazd w czasie" });
      await expect(summary, "statystyki są puste - załaduj historię: npm run db:demo").toBeVisible();
      return { from: summary, to: chart };
    });
  } finally {
    await browser.close();
  }
}

try {
  await playDay();
} catch (error) {
  if (error instanceof PreconditionError) {
    process.stderr.write(`BŁĄD: ${error.message}\n`);
  } else {
    process.stderr.write(
      `BŁĄD: historia urwała się w połowie - zrzuty są niepełne. ${RESET_HINT}\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
  }
  process.exit(1);
}
