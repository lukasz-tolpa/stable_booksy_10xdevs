/**
 * Rodzaj konia (#114, ADR 0005) — wartości kolumny `horses.kind` (CHECK `horses_kind_check`): koń ośrodka
 * albo koń pensjonatowy. Tylko konie ośrodka są końmi pracującymi (formularz grafiku, liczba koni w panelu,
 * strona „Konie”); konie pensjonatowe ośrodek prowadzi na stronie „Pensjonariusze”.
 */
export const HORSE_KIND = { stable: "stable", boarding: "boarding" } as const;

/** Czy koń jest koniem ośrodka (nie pensjonatowym). */
export function isStableHorse(horse: { kind: string }): boolean {
  return horse.kind === HORSE_KIND.stable;
}
