/**
 * Zaślepka zależności przeglądarkowych jsPDF (html2canvas, canvg, dompurify) w paczce workera — alias
 * w `astro.config.mjs`. jsPDF ładuje je dynamicznie tylko dla `html()` i SVG; PDF rozliczenia (spec #100)
 * ich nie używa, więc nie trafiają do workera. Gdyby ktoś je jednak wywołał — czytelny błąd zamiast cichej awarii.
 */
export default function browserOnly(): never {
  throw new Error("html2canvas, canvg i dompurify są wyłączone z paczki workera (spec #100)");
}
