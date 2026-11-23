import type { PluralForms } from "@/lib/format";
import { SLOT_KIND_TEXTS, type SlotKind } from "@/lib/schedule/kind";

/**
 * Teksty zajętości placów (#116) — strona pensjonariusza `/jezdziec/zajetosc-placow` i właściciela
 * `/osrodek/zajetosc-placow`. Słowa z GLOSSARY: zajętość placów, plac, slot rekreacyjny, slot treningowy,
 * pensjonariusz. Nagłówek i podpisy komórek są kontraktem e2e.
 */
export const PLACE_OCCUPANCY_TEXTS = {
  title: "Zajętość placów",
  riderLead: "Ile miejsc jest zajętych na każdym placu w każdej godzinie — sprawdź, zanim wjedziesz na plac.",
  ownerLead: "Ile miejsc jest zajętych na każdym placu w każdej godzinie dnia — tak samo widzą to pensjonariusze.",
  /** Przełącznik ośrodków pensjonariusza (gdy koń stoi w kilku). */
  stables: "Ośrodek",
  dayNav: "Wybór dnia",
  previous: "Poprzedni",
  next: "Następny",
  pickDay: "Wybierz dzień:",
  show: "Pokaż",
  /** Nazwa listy godzin — e2e szuka komórki w niej. */
  grid: "Zajętość placów w godzinach",
  emptyHour: "Brak slotów na placach",
  emptyCell: "brak slotów",
  total: "Razem",
  unscheduled: ["Ośrodek nie ułożył grafiku na ten dzień.", "Wybierz inny dzień."],
  noStables: [
    "Zajętość placów widzi pensjonariusz, którego koń stoi w ośrodku.",
    "Gdy ośrodek doda Twojego konia pensjonatowego, zobaczysz tu jego place.",
  ],
  failure: "Nie udało się wczytać zajętości placów.",
  retry: "Odśwież stronę za chwilę.",
  kind: { recreation: SLOT_KIND_TEXTS.recreation.tag, training: SLOT_KIND_TEXTS.training.tag } satisfies Record<
    SlotKind,
    string
  >,
} as const;

export const TAKEN_SEAT_FORMS: PluralForms = { one: "zajęte miejsce", few: "zajęte miejsca", many: "zajętych miejsc" };
