/**
 * Tłumaczenie kodów błędu bazy na komunikaty dla ośrodka przy dodawaniu instruktora.
 *
 * Jedyną odmową osiągalną z formularza jest zajęta nazwa — pusta nazwa odpada wcześniej
 * w `newInstructorSchema`. Pozostałe kody (RLS, sieć) dostają wariant domyślny.
 */

/** Nazwa zajęta w ośrodku — indeks `instructors_stable_name_key` (także wśród nieaktywnych). */
export const INSTRUCTOR_NAME_TAKEN = "23505";

const FALLBACK = "Nie udało się dodać instruktora. Spróbuj ponownie.";

export function instructorErrorMessage(code: string | undefined): string {
  switch (code) {
    case INSTRUCTOR_NAME_TAKEN:
      return "Masz już instruktora o tej nazwie (wielkość liter nie ma znaczenia), być może wśród nieaktywnych. Nadaj inną nazwę albo aktywuj go ponownie.";
    default:
      return FALLBACK;
  }
}
