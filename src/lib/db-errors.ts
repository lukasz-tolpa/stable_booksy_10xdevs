/**
 * Odczyt kodu i treści z wartości rzuconej przez Supabase / PostgREST.
 *
 * Endpointy dostają `unknown` z bloku `catch` i muszą z niego wyłuskać kod Postgresa,
 * zanim przetłumaczą go przez tabelę komunikatów swojego obszaru
 * (`bookings/errors.ts`, `schedule/errors.ts`). Czytniki są duck-typed i celowo
 * zachowawcze: wszystko, co nie jest obiektem z napisem w polu `code` / `message`
 * (`{}`, `null`, `TypeError: fetch failed`, kod liczbowy), daje `undefined`, więc
 * do użytkownika nigdy nie trafia surowy obiekt dostawcy — tylko wariant domyślny
 * tabeli obszaru.
 */

/** Kod błędu Postgresa z odpowiedzi Supabase, jeśli w ogóle go niesie. */
export function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

/** Treść błędu dostawcy — tylko do dalszej interpretacji, nigdy do pokazania wprost. */
export function errorMessage(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
    ? error.message
    : undefined;
}
