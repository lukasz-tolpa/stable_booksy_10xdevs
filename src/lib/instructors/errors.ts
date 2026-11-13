/**
 * Tłumaczenie kodów błędu bazy na komunikaty dla ośrodka przy dodawaniu instruktora.
 *
 * Jedyną odmową osiągalną z formularza jest zajęta nazwa — pusta nazwa odpada wcześniej
 * w `newInstructorSchema`. Pozostałe kody (RLS, sieć) dostają wariant domyślny.
 */

/** Nazwa zajęta w ośrodku — indeks `instructors_stable_name_key` (także wśród nieaktywnych). */
export const INSTRUCTOR_NAME_TAKEN = "23505";

const FALLBACK = "Nie udało się dodać instruktora. Spróbuj ponownie.";

/** Konto ośrodka bez stadniny (dodanie i przełączenie instruktora). */
export const INSTRUCTOR_NO_STABLE = "Twoje konto nie ma jeszcze stadniny";
/** Formularz przełączenia stanu z nieczytelnym polem. */
export const INSTRUCTOR_TOGGLE_INVALID = "Nieprawidłowe dane formularza";
/** Cudzy albo nieistniejący instruktor — jeden komunikat, bez wyroczni istnienia. */
export const INSTRUCTOR_NOT_FOUND = "Nie znaleziono instruktora w Twojej stadninie.";
/** Przełączenie stanu nie powiodło się z przyczyny spoza reguł (awaria). */
export const INSTRUCTOR_TOGGLE_FAILED = "Nie udało się zmienić stanu instruktora. Spróbuj ponownie.";

export function instructorErrorMessage(code: string | undefined): string {
  switch (code) {
    case INSTRUCTOR_NAME_TAKEN:
      return "Masz już instruktora o tej nazwie (wielkość liter nie ma znaczenia), być może wśród nieaktywnych. Nadaj inną nazwę albo aktywuj go ponownie.";
    default:
      return FALLBACK;
  }
}
