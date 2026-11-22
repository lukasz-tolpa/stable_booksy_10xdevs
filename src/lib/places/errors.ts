/**
 * Komunikaty strony „Place” (#113): odmowy bazy przy dodaniu, zmianie nazwy i przełączeniu placu
 * przetłumaczone na zamknięty zbiór polskich zdań. Tekst dostawcy nigdy nie trafia do ośrodka.
 */

/** Nazwa zajęta w ośrodku — indeks `places_stable_name_key` (także wśród nieaktywnych). */
export const PLACE_NAME_TAKEN = "23505";
/** Dezaktywacja ostatniego aktywnego placu — wyzwalacz `places_keep_one_active`. */
export const PLACE_LAST_ACTIVE = "SB033";

/** Formularz z ukrytymi polami (zmiana nazwy, przełączenie) z nieczytelnym polem. */
export const PLACE_FORM_INVALID = "Nieprawidłowe dane formularza";
/** Cudzy albo nieistniejący plac — jeden komunikat, bez wyroczni istnienia. */
export const PLACE_NOT_FOUND = "Nie znaleziono placu w Twoim ośrodku.";

/** Czynność na stronie „Place” — od niej zależy wariant domyślny komunikatu. */
export type PlaceAction = "create" | "rename" | "toggle";

const REFUSALS = new Map<string, string>([
  [
    PLACE_NAME_TAKEN,
    "Masz już plac o tej nazwie (wielkość liter nie ma znaczenia), być może wśród nieaktywnych. Nadaj inną nazwę albo aktywuj go ponownie.",
  ],
  [PLACE_LAST_ACTIVE, "Ośrodek musi mieć co najmniej jeden aktywny plac. Najpierw dodaj albo aktywuj inny plac."],
]);

const FALLBACKS: Record<PlaceAction, string> = {
  create: "Nie udało się dodać placu. Spróbuj ponownie.",
  rename: "Nie udało się zmienić nazwy placu. Spróbuj ponownie.",
  toggle: "Nie udało się zmienić stanu placu. Spróbuj ponownie.",
};

export function placeErrorMessage(code: string | undefined, action: PlaceAction): string {
  return (code === undefined ? undefined : REFUSALS.get(code)) ?? FALLBACKS[action];
}

/** Odmowa wynikająca z reguł placów, nie awaria — endpoint jej nie loguje. */
export function isExpectedPlaceRefusal(code: string | undefined): boolean {
  return code !== undefined && REFUSALS.has(code);
}
