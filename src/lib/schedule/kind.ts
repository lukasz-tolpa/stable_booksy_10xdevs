/**
 * Rodzaj slotu (#115, GLOSSARY „Slot”, „Slot treningowy”) — wartości kolumny `schedule_slots.kind`
 * (CHECK `schedule_slots_kind_check`). Slot rekreacyjny prowadzi jazdy jeźdźców rekreacyjnych na koniach
 * ośrodka i liczy się do sumy limitów miejsc; na slot treningowy zapisują się tylko pensjonariusze, na swoich
 * koniach pensjonatowych.
 */
export const SLOT_KIND = { recreation: "recreation", training: "training" } as const;

export type SlotKind = (typeof SLOT_KIND)[keyof typeof SLOT_KIND];

/**
 * Podpisy rodzajów slotu — jedyne miejsce tych słów (#112): `label` przy slocie (formularz grafiku, zapisy dnia,
 * sloty instruktora, dzień ośrodka), `tag` — pigułka przy slocie (zajętość placów, slot treningowy), `plural` —
 * wiersz statystyk.
 */
export const SLOT_KIND_TEXTS: Record<SlotKind, { label: string; tag: string; plural: string }> = {
  recreation: { label: "rekreacyjny", tag: "slot rekreacyjny", plural: "Sloty rekreacyjne" },
  training: { label: "treningowy", tag: "slot treningowy", plural: "Sloty treningowe" },
};

/** Podpis rodzaju przy slocie: formularz grafiku, zapisy dnia, sloty instruktora, dzień ośrodka. */
export const SLOT_KIND_LABELS: Record<SlotKind, string> = {
  recreation: SLOT_KIND_TEXTS.recreation.label,
  training: SLOT_KIND_TEXTS.training.label,
};

export function isSlotKind(value: unknown): value is SlotKind {
  return value === SLOT_KIND.recreation || value === SLOT_KIND.training;
}

/** Rodzaj z wiersza bazy; wartość spoza CHECK-a rzuca — strona loguje ją i pokazuje stan awarii. */
export function toSlotKind(value: string): SlotKind {
  if (!isSlotKind(value)) {
    throw new Error(`Nieznany rodzaj slotu: ${value}`);
  }
  return value;
}

/** Pigułka przy slocie treningowym (dzień ośrodka, zapisy dnia, „Moje sloty”) — e2e szuka jej dokładnie. */
export const TRAINING_SLOT_TAG = SLOT_KIND_TEXTS.training.tag;
