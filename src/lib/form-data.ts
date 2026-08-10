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
