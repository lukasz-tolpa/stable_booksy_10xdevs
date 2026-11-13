import { z } from "zod";

/**
 * Liczba całkowita z pola formularza (schemat Zod). Przyjmuje wyłącznie ciąg cyfr (po
 * przycięciu białych znaków) — `z.coerce.number()` zamieniałby brakujące lub puste pole na
 * `0` (brak `hour` odbijał się dopiero od bazy z mylącym komunikatem), a `"abc"` dawał
 * angielski komunikat Zoda. Brak pola ma być błędem walidacji z komunikatem tego pola
 * (walidacja przed pierwszą mutacją, lekcja S-02).
 */
export function formInt(message: string) {
  return z.string().trim().regex(/^\d+$/, { error: message }).transform(Number);
}

/**
 * Bezpieczny odczyt pola tekstowego z formularza.
 *
 * `FormData.get` zwraca `string | File | null`, więc samo `.toString()` zamieniłoby
 * przesłany plik w napis `[object Object]` i przepuściło go do walidacji. Pola tekstowe
 * czytamy wyłącznie wtedy, gdy naprawdę są tekstem.
 */
export function formValue(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Wszystkie wartości pola występującego wielokrotnie — np. grupy pól wyboru, w której
 * każdy zaznaczony element wysyła osobny wpis pod tą samą nazwą.
 */
export function formValues(form: FormData, name: string): string[] {
  return form.getAll(name).filter((value): value is string => typeof value === "string");
}
