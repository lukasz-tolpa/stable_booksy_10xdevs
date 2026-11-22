/**
 * Zapis liczb i godzin w interfejsie — jedyne miejsce, które o nim decyduje. Korzystają
 * z niego strona statystyk, jej tabele i wykres słupkowy, żeby ta sama wartość wszędzie
 * wyglądała tak samo.
 */

import { SCHEDULE_TIME_ZONE } from "@/lib/schedule/dates";

/** Liczba w zapisie polskim (przecinek dziesiętny, tysiące oddzielone spacją). */
export function formatNumber(value: number): string {
  return value.toLocaleString("pl-PL");
}

/** Jednostka godzin; tabele i kafle dokładają ją osobnym, wyszarzonym elementem. */
export const HOURS_UNIT = "h";

/** Godzina zegarowa slotu, np. `13:00` (godziny w grafiku są pełne). */
export function formatClockHour(hour: number): string {
  return `${String(hour)}:00`;
}

/** Wolne miejsca slotu wobec limitu, np. `2 z 4 wolne`. */
export function formatFreeSeats(freeSeats: number, seats: number): string {
  return `${formatNumber(freeSeats)} z ${formatNumber(seats)} wolne`;
}

/** Zajęte miejsca slotu wobec limitu, np. `zajęte 1 z 2` — widok instruktora „Moje sloty”. */
export function formatTakenSeats(taken: number, seats: number): string {
  return `zajęte ${formatNumber(taken)} z ${formatNumber(seats)}`;
}

/**
 * Dzień grafiku (`RRRR-MM-DD`) z dniem tygodnia, bez roku, np. `środa, 18 listopada`. Data
 * kalendarzowa, więc formatowana w UTC — strefa środowiska nie przesunie doby.
 */
export function formatLongDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * Dzień (`RRRR-MM-DD`) z dniem tygodnia i rokiem, np. `środa, 18 listopada 2026` — data w nawigacji
 * dniami (grafik, zapisy dnia, strona ośrodka). Data kalendarzowa, więc w UTC, jak `formatLongDate`.
 */
export function formatLongDateWithYear(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const SHORT_WEEKDAY = new Intl.DateTimeFormat("pl-PL", { weekday: "short", timeZone: "UTC" });
const SHORT_DAY_MONTH = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", timeZone: "UTC" });

/** Skrót dnia tygodnia dnia grafiku (`RRRR-MM-DD`), np. `pt.` — data kalendarzowa, więc w UTC. */
export function formatShortWeekday(iso: string): string {
  return SHORT_WEEKDAY.format(new Date(`${iso}T00:00:00Z`));
}

/** Dzień i skrót miesiąca dnia grafiku (`RRRR-MM-DD`), np. `20 lis` — data kalendarzowa, więc w UTC. */
export function formatShortDate(iso: string): string {
  return SHORT_DAY_MONTH.format(new Date(`${iso}T00:00:00Z`));
}

const LONG_DAY_MONTH = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", timeZone: "UTC" });

/**
 * Dzień i miesiąc w dopełniaczu dnia grafiku (`RRRR-MM-DD`), np. `3 listopada` — opis dnia w kalendarzu
 * rozliczenia jeźdźca. Data kalendarzowa, więc w UTC.
 */
export function formatLongDayMonth(iso: string): string {
  return LONG_DAY_MONTH.format(new Date(`${iso}T00:00:00Z`));
}

const LONG_DAY_MONTH_YEAR = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Dzień, miesiąc w dopełniaczu i rok dnia kalendarzowego (`RRRR-MM-DD`), np. `3 listopada 2026` — dni
 * przyjazdu i wyjazdu pobytu konia. Data kalendarzowa, więc w UTC.
 */
export function formatLongDayMonthYear(iso: string): string {
  return LONG_DAY_MONTH_YEAR.format(new Date(`${iso}T00:00:00Z`));
}

const SHORT_WEEKDAY_DATE = new Intl.DateTimeFormat("pl-PL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * Skrót dnia tygodnia z dniem i skrótem miesiąca (`RRRR-MM-DD`), np. `pt., 6 lis` — data jazdy
 * w Podsumowaniu miesiąca. Data kalendarzowa, więc w UTC.
 */
export function formatShortDateWithWeekday(iso: string): string {
  return SHORT_WEEKDAY_DATE.format(new Date(`${iso}T00:00:00Z`));
}

/** Nazwy miesięcy w mianowniku — `Intl` daje w polskim dopełniacz („listopada”), a miejscownika wcale. */
const MONTH_NAMES = [
  "styczeń",
  "luty",
  "marzec",
  "kwiecień",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpień",
  "wrzesień",
  "październik",
  "listopad",
  "grudzień",
] as const;

/** Nazwy miesięcy w dopełniaczu: „od stycznia”, „od października”. */
const MONTH_NAMES_GENITIVE = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
] as const;

/** Nazwy miesięcy w miejscowniku: „w styczniu”, „w październiku”. */
const MONTH_NAMES_LOCATIVE = [
  "styczniu",
  "lutym",
  "marcu",
  "kwietniu",
  "maju",
  "czerwcu",
  "lipcu",
  "sierpniu",
  "wrześniu",
  "październiku",
  "listopadzie",
  "grudniu",
] as const;

function monthParts(month: string): { year: string; index: number } {
  return { year: month.slice(0, 4), index: Number(month.slice(5, 7)) - 1 };
}

/** Nazwa miesiąca kalendarzowego (`RRRR-MM`) bez roku, np. `listopad`. */
export function formatMonthName(month: string): string {
  return MONTH_NAMES[monthParts(month).index] ?? month;
}

/** Miesiąc kalendarzowy (`RRRR-MM`) z rokiem, np. `listopad 2026` — etykieta przełącznika miesięcy. */
export function formatMonthYear(month: string): string {
  return `${formatMonthName(month)} ${monthParts(month).year}`;
}

/**
 * Miesiąc kalendarzowy (`RRRR-MM`) z rokiem w miejscowniku, z przyimkiem: `w październiku 2026`,
 * a przed „w”/„f” ze spółgłoską — `we wrześniu 2026` (zasada wymowy, jak „we Wrocławiu”).
 */
export function formatInMonthYear(month: string): string {
  const { year, index } = monthParts(month);
  const name = MONTH_NAMES_LOCATIVE[index] ?? month;
  const preposition = /^[wf][^aąeęioóuy]/.test(name) ? "we" : "w";
  return `${preposition} ${name} ${year}`;
}

/** Początek obowiązywania od miesiąca kalendarzowego (`RRRR-MM`), np. `od stycznia 2027` — zmiana stawki. */
export function formatFromMonth(month: string): string {
  const { year, index } = monthParts(month);
  return `od ${MONTH_NAMES_GENITIVE[index] ?? month} ${year}`;
}

/** Godziny pracy dnia `[open, close)`, np. `10:00–16:00` — od pierwszego slotu do końca ostatniego. */
export function formatHourRange(openHour: number, closeHour: number): string {
  return `${formatClockHour(openHour)}–${formatClockHour(closeHour)}`;
}

const DAY_MONTH = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", timeZone: SCHEDULE_TIME_ZONE });

/** Dzień i miesiąc chwili w strefie ośrodka, np. `21 maja` — do terminów typu „ważne do …”. */
export function formatDayMonth(at: Date): string {
  return DAY_MONTH.format(at);
}

const DAY_MONTH_YEAR = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: SCHEDULE_TIME_ZONE,
});

/** Dzień, miesiąc i rok chwili w strefie ośrodka, np. `21 listopada 2026` — „stan na …” w PDF rozliczenia. */
export function formatDayMonthYear(at: Date): string {
  return DAY_MONTH_YEAR.format(at);
}

const DATE_TIME = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: SCHEDULE_TIME_ZONE,
});

/**
 * Data i godzina chwili w strefie ośrodka, np. `21.11.2026, 14:05` — stopka PDF rozliczenia. Składana
 * z części, żeby układ nie zależał od wersji danych językowych środowiska.
 */
export function formatDateTime(at: Date): string {
  const part = Object.fromEntries(DATE_TIME.formatToParts(at).map(({ type, value }) => [type, value]));
  return `${part.day}.${part.month}.${part.year}, ${part.hour}:${part.minute}`;
}

/** Godziny jako jeden tekst, np. `3 h` — do etykiet wykresów i ich tabel z danymi. */
export function formatHours(hours: number): string {
  return `${formatNumber(hours)} ${HOURS_UNIT}`;
}

/** Procent jako jeden tekst, np. `67%` — w panelu ośrodka i na kafelkach statystyk. */
export function formatPercent(percent: number): string {
  return `${formatNumber(percent)}%`;
}

/** Trzy formy polskiego rzeczownika po liczebniku: `1 zapis`, `2 zapisy`, `5 zapisów`. */
export interface PluralForms {
  one: string;
  few: string;
  many: string;
}

/**
 * Forma rzeczownika po liczbie: dokładnie 1 — `one`; końcówka 2–4 poza nastkami 12–14 — `few`;
 * reszta (0, 5+, 11–14, 21, 25…) — `many`.
 */
export function pluralForm(count: number, forms: PluralForms): string {
  const abs = Math.abs(count);
  const lastTwo = abs % 100;
  const last = abs % 10;

  if (abs === 1) {
    return forms.one;
  }
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return forms.few;
  }
  return forms.many;
}

/** Liczba z odmienionym rzeczownikiem, np. `5 zapisów`, `1 dzień`. */
export function formatCount(count: number, forms: PluralForms): string {
  return `${formatNumber(count)} ${pluralForm(count, forms)}`;
}

/** Odmiana „zapis” — wspólna dla komunikatów grafiku i panelu ośrodka. */
export const BOOKING_FORMS: PluralForms = { one: "zapis", few: "zapisy", many: "zapisów" };

/** Odmiana „jazda” — panel ośrodka i Podsumowanie miesiąca. */
export const RIDE_FORMS: PluralForms = { one: "jazda", few: "jazdy", many: "jazd" };
/** Odmiana „jeździec” po liczebniku: `1 jeździec`, `2 jeźdźców`, `5 jeźdźców`. */
export const RIDER_FORMS: PluralForms = { one: "jeździec", few: "jeźdźców", many: "jeźdźców" };

const NBSP = " ";

/**
 * Kwota w groszach (liczba całkowita) po polsku, np. `1 250,00 zł` — rozliczenia (#94). Zawsze dwa
 * miejsca po przecinku; tysiące od czterech cyfr oddzielone twardą spacją (`formatNumber` grupuje
 * dopiero od pięciu), twarda spacja także przed „zł”, żeby kwota nie łamała się w wierszu.
 */
export function formatMoney(grosze: number): string {
  const sign = grosze < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(grosze));
  const zloty = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${zloty},${fraction}${NBSP}zł`;
}

/**
 * Kwota w groszach jako wartość pola formularza, np. `750,50` — bez „zł” i separatorów tysięcy, żeby
 * „Popraw” koszt dodatkowy (#96) odesłał ją bez zmian (`parseAmount`).
 */
export function formatAmountInput(grosze: number): string {
  const abs = Math.abs(Math.trunc(grosze));
  return `${String(Math.floor(abs / 100))},${String(abs % 100).padStart(2, "0")}`;
}

/** Tekst z wielką literą na początku — np. zdanie zaczynające się od `formatInMonthYear`: `W październiku 2026 …`. */
export function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
