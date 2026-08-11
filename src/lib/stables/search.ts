/**
 * Przygotowanie frazy wyszukiwania z adresu do użycia w zapytaniu.
 *
 * Fraza przechodzi przez DWIE warstwy składni, z których każda ma własne znaki
 * specjalne, i obie trzeba obsłużyć:
 *
 *   1. Wyrażenie filtra PostgREST — `or()` skleja warunki przecinkami i grupuje
 *      nawiasami, a cudzysłów otwiera wartość cytowaną. Te znaki USUWAMY, bo w nazwie
 *      stadniny czy miejscowości nie niosą treści, a przepuszczone rozwaliłyby zapytanie.
 *   2. Wzorzec LIKE — `%` dopasowuje dowolny ciąg, `_` dowolny znak, `\` je ekranuje.
 *      Te znaki EKRANUJEMY, żeby użytkownik nie miał dostępu do składni wzorca:
 *      wpisanie `%` ma szukać znaku procenta, a nie wyświetlać całą tabelę.
 */

/** Górny limit długości frazy — chroni przed absurdalnie długim parametrem w adresie. */
export const MAX_SEARCH_LENGTH = 100;

export function prepareSearchTerm(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim().slice(0, MAX_SEARCH_LENGTH);
  if (!trimmed) {
    return null;
  }

  const withoutFilterSyntax = trimmed.replace(/[,()"]/g, "");
  if (!withoutFilterSyntax) {
    return null;
  }

  // Kolejność jest krytyczna: najpierw ukośnik, potem reszta. Odwrotna kolejność
  // podwoiłaby ukośniki dodane w krokach późniejszych.
  return withoutFilterSyntax.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
