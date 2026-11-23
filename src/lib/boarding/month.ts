/**
 * Reguła „pensjonariusz w miesiącu” (GLOSSARY „Pensjonariusz”, ADR 0005, #114): jeździec jest
 * pensjonariuszem ośrodka w każdym miesiącu, na który zachodzi pobyt choć jednego jego konia w tym
 * ośrodku — w całości, także w miesiącu przyjazdu i wyjazdu.
 *
 * Bliźniak w bazie: `private.stay_overlaps_month` / `private.is_boarder_in_month`
 * (migracja 20261201100000). Obie strony sprawdzają te same przypadki
 * (`month.test.ts`, `supabase/tests/boarding_horses.sql`); zmiana reguły to zmiana obu naraz.
 */

/** Pobyt konia pensjonatowego: dzień przyjazdu i dzień wyjazdu (`RRRR-MM-DD`), `null` — trwa. */
export interface BoardingStay {
  arrivalDay: string;
  departureDay: string | null;
}

/** Czy pobyt zachodzi na miesiąc `RRRR-MM` (przyjazd nie później, wyjazd nie wcześniej niż ten miesiąc). */
export function stayOverlapsMonth(stay: BoardingStay, month: string): boolean {
  return stay.arrivalDay.slice(0, 7) <= month && (stay.departureDay === null || stay.departureDay.slice(0, 7) >= month);
}

/** Czy jeździec z tymi pobytami koni (w jednym ośrodku) jest w miesiącu `RRRR-MM` pensjonariuszem. */
export function isBoarderInMonth(stays: readonly BoardingStay[], month: string): boolean {
  return stays.some((stay) => stayOverlapsMonth(stay, month));
}

/**
 * Czy pobyt obejmuje dzień `RRRR-MM-DD` (dzień przyjazdu i wyjazdu włącznie) — koń pensjonatowy przy slocie
 * treningowym tego dnia (#115). Bliźniak `private.stay_covers_day` (migracja 20261202090000).
 */
export function stayCoversDay(stay: BoardingStay, day: string): boolean {
  return stay.arrivalDay <= day && (stay.departureDay === null || stay.departureDay >= day);
}

/**
 * Koń pensjonatowy ośrodka z pensjonariuszem i pobytami — wiersz wspólnego odczytu `listBoardingHorses`
 * (`@/lib/boarding/queries`, #112). Każdy moduł bierze z niego tylko pola, których potrzebuje.
 */
export interface BoardingHorse {
  horseId: number;
  horseName: string;
  stableId: number;
  stableName: string;
  /** Pensjonariusz (konto); `null` — konto usunięte, koń bez właściciela. */
  riderKey: string | null;
  /** Nazwa pensjonariusza z profilu; `null` — profil nieczytelny albo bez nazwiska. */
  riderName: string | null;
  stays: readonly BoardingStay[];
}

/**
 * Konie jednego pensjonariusza (#112) — pierwszy krok reguły „konie jeźdźca → pobyty → reguła”; kolejne to
 * `isBoarderWith`, `horsesInMonth` i `horsesOnDay`. Koń bez właściciela nie należy do nikogo.
 */
export function horsesOf<H extends Pick<BoardingHorse, "riderKey">>(horses: readonly H[], riderKey: string): H[] {
  return horses.filter((horse) => horse.riderKey === riderKey);
}

/** Reguła „pensjonariusz w miesiącu” dla koni jeźdźca w jednym ośrodku: pobyt choć jednego zachodzi na miesiąc. */
export function isBoarderWith(horses: readonly Pick<BoardingHorse, "stays">[], month: string): boolean {
  return isBoarderInMonth(
    horses.flatMap((horse) => horse.stays),
    month,
  );
}

/** Konie, których pobyt zachodzi na miesiąc `RRRR-MM` — pozycje opłat za pensjonat, karta pensjonariusza. */
export function horsesInMonth<H extends Pick<BoardingHorse, "stays">>(horses: readonly H[], month: string): H[] {
  return horses.filter((horse) => horse.stays.some((stay) => stayOverlapsMonth(stay, month)));
}

/** Konie, których pobyt obejmuje dzień `RRRR-MM-DD` — konie przy slocie treningowym, zajętość placów. */
export function horsesOnDay<H extends Pick<BoardingHorse, "stays">>(horses: readonly H[], day: string): H[] {
  return horses.filter((horse) => horse.stays.some((stay) => stayCoversDay(stay, day)));
}

/**
 * Rodzaj jeźdźca w miesiącu (#112) — wynik reguły „pensjonariusz w miesiącu”: jeździec rekreacyjny albo
 * pensjonariusz. Jeden podział dla sekcji rozliczeń i podsumowania miesiąca (nagłówki `RIDER_KIND_HEADINGS`).
 * Rodzaj stawki (`RateKind`: rekreacyjna, treningowa) to inne pojęcie — wynika z rodzaju jeźdźca.
 */
export const RIDER_KIND = { recreation: "recreation", boarder: "boarder" } as const;

export type RiderKind = (typeof RIDER_KIND)[keyof typeof RIDER_KIND];

/** Kolejność sekcji list jeźdźców: rekreacja, potem pensjonariusze. */
export const RIDER_KINDS: readonly RiderKind[] = [RIDER_KIND.recreation, RIDER_KIND.boarder];

/** Rodzaj jeźdźca `riderKey` w miesiącu `RRRR-MM` wobec koni pensjonatowych ośrodka. */
export function riderKindOf(
  horses: readonly Pick<BoardingHorse, "riderKey" | "stays">[],
  riderKey: string,
  month: string,
): RiderKind {
  return isBoarderWith(horsesOf(horses, riderKey), month) ? RIDER_KIND.boarder : RIDER_KIND.recreation;
}
