/**
 * Zrzuty do sekcji „Jeden dzień ze Stable Booksy” na stronie głównej (#53).
 *
 * Skrypt ODGRYWA dzień na lokalnej bazie i po każdym kroku robi zrzut właściwego
 * regionu ekranu w dwóch szerokościach (komputer i telefon):
 *
 *   1. ośrodek otwiera grafik dnia seeda        → grafik-*.webp
 *   2. Anna widzi swój zapis na 11:00           → sloty-*.webp
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
 * Skrypt sam bazy nie resetuje. Zanim cokolwiek zmieni, sprawdza, że podgląd odpowiada
 * i że baza jest w stanie wyjściowym; przy każdym odstępstwie kończy się komunikatem,
 * nie zapisując nic ani w bazie, ani na dysku.
 *
 * Zapis Anny o 11:00 (bez konia) pochodzi z seeda - potrzebują go też testy bazy i e2e.
 * Skrypt go nie usuwa i nie tworzy: wymaga, żeby istniał i był nietknięty. JEDYNYM
 * zapisem do bazy w całym skrypcie jest przydział konia w kroku 3, zrobiony przez
 * interfejs jako ośrodek. SQL-em (jako superuser) skrypt wyłącznie czyta stan. Drugie
 * uruchomienie bez `db reset` widzi zapis z koniem i odmawia.
 *
 * Wynik, commitowany razem:
 *   - `public/jeden-dzien/<ekran>-<komputer|telefon>.webp`,
 *   - `src/lib/landing/day-shots.json` - manifest: adres i wymiary każdego pliku. To
 *     z niego strona bierze adresy i `width`/`height` (`src/lib/landing/day.ts`), więc
 *     nazwy plików, przyrostki i katalog są zapisane tylko tutaj.
 *
 * Stoi POZA `e2e/` (jak `scripts/shots.mjs`), więc suita go nie zbiera.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium, expect } from "@playwright/test";
import sharp from "sharp";
import { runLocalSql } from "./db-demo.mjs";
import {
  BASE_URL,
  RIDER_EMAIL,
  STABLE_EMAIL,
  STABLE_NAME,
  findStablePath,
  seedDay,
  settle,
  signIn,
} from "./shots-lib.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
/** Katalog zrzutów w `public/` - zarazem pierwszy człon ich adresu na stronie. */
const SHOTS_DIR = "jeden-dzien";
const OUT_DIR = path.join(ROOT, "public", SHOTS_DIR);
const MANIFEST_FILE = path.join(ROOT, "src", "lib", "landing", "day-shots.json");
const RESET_HINT = "Przygotuj bazę od nowa: npx supabase db reset && npm run db:demo";

/** Historia: Anna jeździ o 11:00 u jedynej instruktorki dnia seeda, ośrodek daje jej Bellę. */
const RIDER_NAME = "Anna Kowalska";
const HOUR = 11;
const INSTRUCTOR = "Joanna Wrona";
const HORSE = "Bella";

/**
 * Dwie szerokości każdego zrzutu: `key` to nazwa w manifeście, `suffix` to przyrostek
 * pliku. Komputer: region ma szerokość kontenera aplikacji (880 px). Telefon: 390 px
 * przy gęstości 2, żeby tekst był ostry po wstawieniu w wąską ramkę na stronie głównej.
 */
const VARIANTS = [
  { key: "desktop", suffix: "komputer", viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
  { key: "phone", suffix: "telefon", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
];

/** Margines wycinka wokół regionu, w pikselach CSS. */
const PAD = 16;
const WEBP_QUALITY = 82;

/** Błąd stanu wyjściowego - komunikat dla człowieka, bez śladu stosu. */
class PreconditionError extends Error {}

/** Podgląd aplikacji musi odpowiadać, zanim zacznie się historia. Nic nie zapisuje. */
async function checkPreview() {
  try {
    const response = await globalThis.fetch(BASE_URL, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      throw new Error(`HTTP ${String(response.status)}`);
    }
  } catch (error) {
    throw new PreconditionError(
      `Podgląd aplikacji nie odpowiada pod ${BASE_URL} (${error instanceof Error ? error.message : String(error)}). ` +
        "Uruchom go (npm run build && npm run preview -- --port 4173) albo wskaż inny adres w SHOTS_BASE_URL.",
    );
  }
}

/**
 * @typedef {object} StartingState
 * @property {boolean} scheduled czy ośrodek ma grafik na dzień seeda
 * @property {{ hour: number, status: string, horse: number | null }[]} anna zapisy Anny w tym dniu
 * @property {number} others zapisy innych jeźdźców w tym dniu
 * @property {number} history zapisy ośrodka w dniach minionych (historia demo)
 * @property {number} e2e konta zakładane przez setup e2e
 */

/**
 * Stan bazy przed odegraniem historii: czysty seed z nietkniętym zapisem Anny o 11:00
 * (aktywny, bez konia) i historia demo. Rzuca `PreconditionError` przy każdym
 * odstępstwie; tylko czyta.
 * @param {string} day
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
         select json_agg(json_build_object('hour', b.hour, 'status', b.status, 'horse', b.horse_id))
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

  const seeded = state.anna.length === 1 && state.anna[0].status === "active" && state.anna[0].hour === HOUR;
  if (!seeded) {
    throw new PreconditionError(
      `Dzień ${day} nie ma dokładnie jednego aktywnego zapisu Anny o ${String(HOUR)}:00, który wstawia seed ` +
        `(dane są zmienione). ${RESET_HINT}`,
    );
  }
  if (state.anna[0].horse !== null) {
    throw new PreconditionError(
      `Zapis Anny o ${String(HOUR)}:00 w dniu ${day} ma już konia - historia była już odegrana na tej bazie. ${RESET_HINT}`,
    );
  }
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
  const context = await browser.newContext({ ...shared, ...contextSize(first) });
  const actor = await context.newPage();
  await signIn(actor, email);
  const storageState = await context.storageState();

  const views = [{ variant: first, page: actor }];
  for (const variant of rest) {
    const other = await browser.newContext({ ...shared, ...contextSize(variant), storageState });
    views.push({ variant, page: await other.newPage() });
  }
  return { actor, views };
}

/** @param {(typeof VARIANTS)[number]} variant */
function contextSize(variant) {
  return { viewport: variant.viewport, deviceScaleFactor: variant.deviceScaleFactor };
}

/**
 * @typedef {{ src: string, width: number, height: number }} ShotFile adres na stronie i wymiary pliku
 * @typedef {Record<string, Record<string, ShotFile>>} Manifest nazwa zrzutu → `key` wariantu → plik
 */

/**
 * Wycinek strony: pełna szerokość `<main>`, w pionie od góry `region.from` do dołu
 * `region.to` z marginesem. Górny pasek jest nad `<main>`, więc nigdy nie wchodzi w kadr.
 * Zapisuje plik każdego wariantu i dopisuje go do manifestu.
 * @param {Manifest} manifest
 * @param {{ views: { variant: (typeof VARIANTS)[number], page: import("@playwright/test").Page }[] }} role
 * @param {string} name
 * @param {string} url
 * @param {(page: import("@playwright/test").Page) => Promise<{ from: import("@playwright/test").Locator, to?: import("@playwright/test").Locator }>} region
 */
async function capture(manifest, role, name, url, region) {
  manifest[name] = {};
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
      throw new Error(`Zrzut „${name}” (${variant.suffix}): region nie jest widoczny na ${url}.`);
    }
    const y = Math.max(0, top.y - PAD);
    const png = await page.screenshot({
      fullPage: true,
      clip: { x: main.x, y, width: main.width, height: bottom.y + bottom.height + PAD - y },
    });
    const fileName = `${name}-${variant.suffix}.webp`;
    const file = path.join(OUT_DIR, fileName);
    const info = await sharp(png).webp({ quality: WEBP_QUALITY }).toFile(file);
    manifest[name][variant.key] = { src: `/${SHOTS_DIR}/${fileName}`, width: info.width, height: info.height };
    process.stdout.write(
      `${path.relative(process.cwd(), file)}  ${String(info.width)}x${String(info.height)}  ${String(Math.round(info.size / 1024))} KB\n`,
    );
  }
}

/**
 * Arkusz limitów przewija się w poziomie we własnym kontenerze, gdy nie mieści się
 * w karcie (telefon). Przewijamy go do prawej krawędzi, żeby ostatnia kolumna „Koni
 * zajętych” była w kadrze cała; kolumna godzin jest przyklejona, więc też zostaje.
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<import("@playwright/test").Locator>} kontener arkusza
 */
async function showSheetFillColumn(page) {
  const table = page.getByRole("table");
  const scroller = table.locator("..");
  await scroller.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  const [box, cell] = await Promise.all([
    scroller.boundingBox(),
    table.getByRole("columnheader", { name: "Koni zajętych" }).boundingBox(),
  ]);
  if (!box || !cell || cell.x + cell.width > box.x + box.width + 0.5) {
    throw new Error("Kolumna „Koni zajętych” nie mieści się w kadrze arkusza limitów.");
  }
  return scroller;
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

  // Najpierw sprawdzenia, potem skutki: do tego miejsca nic nie jest zapisywane.
  await checkPreview();
  checkStartingState(day);

  mkdirSync(OUT_DIR, { recursive: true });
  /** @type {Manifest} */
  const manifest = {};

  const browser = await chromium.launch();
  try {
    const stable = await openRole(browser, STABLE_EMAIL);
    const rider = await openRole(browser, RIDER_EMAIL);

    // 1. Ośrodek otwiera grafik dnia: konie, instruktorzy i arkusz limitów z „Koni zajętych”.
    await capture(manifest, stable, "grafik", `${BASE_URL}/osrodek/grafik?dzien=${day}`, async (page) => {
      await expect(page.getByRole("columnheader", { name: "Koni zajętych" })).toBeVisible();
      return { from: page.getByRole("group", { name: /^Konie/ }), to: await showSheetFillColumn(page) };
    });

    // 2. Anna widzi swój zapis na 11:00 (z seeda). Adres ośrodka z katalogu - seed generuje nowe id.
    const slotsUrl = `${BASE_URL}${await findStablePath(rider.actor)}?dzien=${day}`;
    await capture(manifest, rider, "sloty", slotsUrl, async (page) => {
      await expect(slotItem(page, HOUR, INSTRUCTOR)).toContainText("Twój zapis");
      return { from: page.getByRole("heading", { level: 2, name: "Wolne sloty" }).locator("..") };
    });

    // 3. Ośrodek przydziela Annie konia na liście zapisów dnia - jedyny zapis do bazy w skrypcie.
    const dayUrl = `${BASE_URL}/osrodek/zapisy?dzien=${day}`;
    await stable.actor.goto(dayUrl);
    await settle(stable.actor);
    const row = dayBookingRow(stable.actor);
    await row.getByLabel("Koń", { exact: true }).selectOption({ label: HORSE });
    await row.getByRole("button", { name: "Zapisz konia" }).click();
    await stable.actor.waitForURL(/sukces=przydzial/);
    await capture(manifest, stable, "zapisy-dnia", dayUrl, async (page) => {
      // Dowód z bazy: po przeładowaniu koń stoi w opisie wiersza, nie tylko w liście wyboru.
      await expect(dayBookingRow(page).getByText(HORSE, { exact: true }).first()).toBeVisible();
      return { from: page.getByRole("region", { name: "Aktywne", exact: true }) };
    });

    // 4. Anna widzi konia przy nadchodzącej jeździe.
    await capture(manifest, rider, "moje-zapisy", `${BASE_URL}/jezdziec/zapisy`, async (page) => {
      const upcoming = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { level: 2, name: "Nadchodzące" }) });
      await expect(upcoming.getByRole("listitem").filter({ hasText: INSTRUCTOR })).toContainText(HORSE);
      return { from: upcoming };
    });

    // 5. Ośrodek patrzy w statystyki: podsumowanie okresu i wykres godzin jazd.
    await capture(manifest, stable, "statystyki", `${BASE_URL}/osrodek/statystyki`, async (page) => {
      const summary = page.getByRole("region", { name: "Podsumowanie okresu" });
      const chart = page.getByRole("region", { name: "Godziny jazd w czasie" });
      await expect(summary, "statystyki są puste - załaduj historię: npm run db:demo").toBeVisible();
      return { from: summary, to: chart };
    });
  } finally {
    await browser.close();
  }

  // Manifest dopiero po komplecie zrzutów: urwana historia nie zostawia wymiarów bez plików.
  writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${path.relative(process.cwd(), MANIFEST_FILE)}\n`);
}

try {
  await playDay();
} catch (error) {
  if (error instanceof PreconditionError) {
    process.stderr.write(`BŁĄD: ${error.message}\n`);
  } else {
    process.stderr.write(
      `BŁĄD: historia urwała się w połowie - zrzuty są niepełne, manifest nie został zapisany. ${RESET_HINT}\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
  }
  process.exit(1);
}
