/**
 * Straznik tokenow wizualnych: kolory i kroje pisma zyja raz, w `src/styles/global.css`
 * (DESIGN.md §2). Kazdy inny plik w `src/` siega po nie przez `var(--…)`.
 *
 *   node scripts/check-tokens.mjs        # czesc `npm run lint`, wiec takze CI
 *
 * - `font-family` poza global.css przyjmuje tylko `var(--font-…)` albo `inherit`.
 * - Literal koloru (`oklch(`, `rgb(`, `hsl(`, `#hex`) poza global.css jest bledem,
 *   z wyjatkiem linii wpisanych do COLOUR_BASELINE - to stan zastany (polprzezroczyste
 *   warianty bez wlasnego tokenu). Baseline tylko maleje: nowy kolor dostaje token
 *   w global.css, a nie nowy wpis tutaj.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");
const TOKENS_FILE = "src/styles/global.css";
const EXTENSIONS = new Set([".astro", ".css", ".tsx"]);

/** Dozwolona liczba linii z literalem koloru na plik (stan z 2026-11-11). */
const COLOUR_BASELINE = new Map([
  ["src/components/Topbar.astro", 1],
  ["src/components/ui/Card.astro", 1],
  ["src/pages/jezdziec/zapisy.astro", 1],
]);

const FONT_FAMILY = /font-family\s*:\s*([^;]+)/;
const FONT_ALLOWED = /^(var\(--font-[a-z-]+\)|inherit)$/;
// `#hex` tylko jako wartosc deklaracji CSS - bez tego lapalyby sie kotwice i selektory id.
const COLOUR_LITERAL = /\b(?:oklch|oklab|rgba?|hsla?)\(|:\s*[^;{]*#[0-9a-fA-F]{3,8}\b/;

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return EXTENSIONS.has(path.extname(entry.name)) ? [full] : [];
  });
}

/** @type {string[]} */
const problems = [];

for (const file of walk(SRC)) {
  const relative = path.relative(ROOT, file).replaceAll("\\", "/");
  if (relative === TOKENS_FILE) continue;

  /** @type {number[]} */
  const colourLines = [];
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, index) => {
      const font = FONT_FAMILY.exec(line)?.[1]?.trim();
      if (font !== undefined && !FONT_ALLOWED.test(font)) {
        problems.push(`${relative}:${String(index + 1)} font-family "${font}" - uzyj var(--font-…) z global.css`);
      }
      if (COLOUR_LITERAL.test(line)) colourLines.push(index + 1);
    });

  const allowed = COLOUR_BASELINE.get(relative) ?? 0;
  if (colourLines.length > allowed) {
    problems.push(
      `${relative}: ${String(colourLines.length)} linii z literalem koloru (dozwolone ${String(allowed)}), linie ${colourLines.join(", ")} - ` +
        "uzyj var(--…) albo dodaj token w global.css",
    );
  } else if (colourLines.length < allowed) {
    problems.push(
      `${relative}: literalow koloru jest ${String(colourLines.length)}, a baseline dopuszcza ${String(allowed)} - obniz wpis w scripts/check-tokens.mjs`,
    );
  }
}

if (problems.length > 0) {
  process.stderr.write(`Straznik tokenow: ${String(problems.length)} naruszen\n${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write("Straznik tokenow: brak literalow kolorow i krojow poza global.css\n");
