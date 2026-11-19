import type { PluralForms } from "@/lib/format";

/**
 * Teksty panelu ośrodka (`/osrodek`, spec #83). Nagłówek „Panel ośrodka” jest kontraktem e2e
 * (logowanie w `e2e/auth.setup.ts` na nim czeka) — nie zmieniać.
 */
export const PANEL_TEXTS = {
  heading: "Panel ośrodka",
  noStable: "Twoje konto nie ma jeszcze przypisanej stadniny.",
  today: "Dziś",
  tomorrow: "Jutro",
  week: {
    heading: "Najbliższe 7 dni",
    scheduled: "ułożony",
    unscheduled: "brak grafiku",
    arrange: "Ułóż",
    failure: "Nie udało się wczytać najbliższych dni.",
  },
  lastMonth: {
    heading: "Ostatnie 30 dni",
    fullStats: "Pełne statystyki",
    empty: "W ostatnich 30 dniach nie było jazd ani wystawionych miejsc.",
    rideHours: "Godziny jazd",
    occupancy: "Obłożenie grafiku",
    occupancyNote: "miejsc, na których była jazda",
    cancellations: "Odwołania",
    cancellationsNote: "jeźdźców i ośrodka",
    topHorse: "Najbardziej obciążony koń",
    noHorseRides: "brak jazd z koniem",
    none: "—",
    failure: "Nie udało się wczytać liczb z ostatnich 30 dni.",
  },
  side: {
    heading: "Ośrodek",
    schedule: "Grafik",
    bookings: "Zapisy",
    horses: "Konie",
    instructors: "Instruktorzy",
    stats: "Statystyki",
    tomorrowScheduled: "jutro: ułożony",
    tomorrowUnscheduled: "jutro: brak grafiku",
    anyPeriod: "dowolny okres",
    failure: "Nie udało się wczytać liczb przy sekcjach ośrodka.",
  },
  retry: "Odśwież stronę za chwilę.",
} as const;

export const SEAT_FORMS: PluralForms = { one: "miejsce", few: "miejsca", many: "miejsc" };
export const DAY_FORMS: PluralForms = { one: "dzień", few: "dni", many: "dni" };
export const ACTIVE_FORMS: PluralForms = { one: "aktywny", few: "aktywne", many: "aktywnych" };
export const RIDE_FORMS: PluralForms = { one: "jazda", few: "jazdy", many: "jazd" };
