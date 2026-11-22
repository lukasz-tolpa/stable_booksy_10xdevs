/**
 * Rodzaj slotu (#115, GLOSSARY „Slot”, „Slot treningowy”) — wartości kolumny `schedule_slots.kind`
 * (CHECK `schedule_slots_kind_check`). Slot rekreacyjny prowadzi jazdy jeźdźców rekreacyjnych na koniach
 * ośrodka i liczy się do sumy limitów miejsc; na slot treningowy zapisują się tylko pensjonariusze, na swoich
 * koniach pensjonatowych.
 */
export const SLOT_KIND = { recreation: "recreation", training: "training" } as const;

export type SlotKind = (typeof SLOT_KIND)[keyof typeof SLOT_KIND];

/** Podpis rodzaju przy slocie: formularz grafiku, zapisy dnia, sloty instruktora, dzień ośrodka. */
export const SLOT_KIND_LABELS: Record<SlotKind, string> = {
  recreation: "rekreacyjny",
  training: "treningowy",
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
export const TRAINING_SLOT_TAG = "slot treningowy";
