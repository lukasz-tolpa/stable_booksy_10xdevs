/**
 * Rodzaj konia (#114, ADR 0005) — wartości kolumny `horses.kind` (CHECK `horses_kind_check`): koń ośrodka
 * albo koń pensjonatowy. Tylko konie ośrodka są końmi pracującymi (formularz grafiku, liczba koni w panelu,
 * strona „Konie”); konie pensjonatowe ośrodek prowadzi na stronie „Pensjonariusze”.
 */
export const HORSE_KIND = { stable: "stable", boarding: "boarding" } as const;

/** Rodzaj konia (`horses.kind`): koń ośrodka albo koń pensjonatowy. */
export type HorseKind = (typeof HORSE_KIND)[keyof typeof HORSE_KIND];

/** Wartość `horses.kind` z bazy jako `HorseKind`; inna wartość to błąd schematu. */
export function toHorseKind(value: string): HorseKind {
  if (value !== HORSE_KIND.stable && value !== HORSE_KIND.boarding) {
    throw new Error(`Nieznany rodzaj konia: ${value}`);
  }
  return value;
}

/** Czy koń jest koniem ośrodka (nie pensjonatowym). */
export function isStableHorse(horse: { kind: HorseKind }): boolean {
  return horse.kind === HORSE_KIND.stable;
}
