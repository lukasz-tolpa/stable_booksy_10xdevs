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
