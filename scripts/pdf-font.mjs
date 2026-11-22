/**
 * Czcionka PDF rozliczenia jeźdźca (spec #100, `npm run pdf:font`): Inter 400 i 600, okrojony do znaków,
 * które dokument może zawierać, zapisany jako moduł z base64 (postać, którą przyjmuje jsPDF
 * `addFileToVFS`). Wynik jest w repo — budowanie aplikacji nie potrzebuje tego skryptu ani sieci.
 * Uruchamiaj ponownie tylko przy zmianie zestawu znaków (`CHARS`) albo źródła.
 *
 * Źródło (powtarzalne): zmienny Inter `Inter[opsz,wght].ttf` z repozytorium google/fonts, przypięty
 * do commita `SOURCE_COMMIT` i sprawdzany sumą SHA-256 — ten sam plik, który serwuje Google Fonts.
 * Osie przypięte do `wght` 400 / 600 i `opsz` 14 (tekst, nie „Display”). Licencja: SIL OFL 1.1
 * (`OFL.txt` z tego samego commita, kopiowany obok modułu) — osadzanie i okrajanie dozwolone.
 *
 * Zestaw znaków: Latin-1 (U+0020–U+007E, U+00A0–U+00FF, w tym × i twarda spacja z `formatMoney`),
 * Latin Extended-A (U+0100–U+017F: polskie i inne litery łacińskie z diakrytykami) oraz typografia
 * tekstów: „ ” “ ‘ ’ — – …. Pisma spoza tego zestawu (np. cyrylica) nie wyświetlą się — poza zakresem.
 *
 * Bez tablic układu (GSUB/GPOS/kern) i hintingu: jsPDF ich nie używa, a mniejszy plik to krótsze
 * parsowanie czcionki przy każdym dokumencie (limit CPU workera, spec #100).
 *
 *   npm run pdf:font
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import subsetFontUntyped from "subset-font";

/**
 * `subset-font` nie ma typów — sygnatura z jego README.
 * @type {(font: Buffer, text: string, options: Record<string, unknown>) => Promise<Buffer>}
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- moduł bez typów, sygnatura w JSDoc wyżej
const subsetFont = subsetFontUntyped;

const SOURCE_COMMIT = "0b58fb370093f9a9f4ff785d94405710b79de67c";
const SOURCE_BASE = `https://raw.githubusercontent.com/google/fonts/${SOURCE_COMMIT}/ofl/inter`;
const SOURCE_FONT = `${SOURCE_BASE}/Inter%5Bopsz,wght%5D.ttf`;
const SOURCE_LICENSE = `${SOURCE_BASE}/OFL.txt`;
const SOURCE_SHA256 = "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031";

const OUT_DIR = path.resolve(import.meta.dirname, "..", "src", "lib", "settlements", "pdf");
const OUT_MODULE = path.join(OUT_DIR, "fonts.ts");
const OUT_LICENSE = path.join(OUT_DIR, "Inter-OFL.txt");

/**
 * Znaki od `from` do `to` włącznie.
 * @param {number} from
 * @param {number} to
 */
function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, index) => String.fromCodePoint(from + index)).join("");
}

const CHARS = [range(0x20, 0x7e), range(0xa0, 0xff), range(0x100, 0x17f), "„”“‘’—–…"].join("");

const WEIGHTS = [
  { name: "INTER_REGULAR", wght: 400 },
  { name: "INTER_SEMIBOLD", wght: 600 },
];

/** @param {string} url */
async function download(url) {
  const response = await globalThis.fetch(url);
  if (!response.ok) {
    throw new Error(`Nie udało się pobrać ${url}: HTTP ${String(response.status)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

const source = await download(SOURCE_FONT);
const sha = createHash("sha256").update(source).digest("hex");
if (sha !== SOURCE_SHA256) {
  throw new Error(`Suma SHA-256 źródła się nie zgadza: ${sha} (oczekiwano ${SOURCE_SHA256})`);
}

const constants = [];
for (const { name, wght } of WEIGHTS) {
  const subset = await subsetFont(source, CHARS, {
    targetFormat: "sfnt",
    variationAxes: { wght, opsz: 14 },
    keepFeatures: [],
    noHinting: true,
    dropTables: ["GSUB", "GPOS", "GDEF", "kern", "STAT"],
  });
  process.stdout.write(`${name}: ${String(subset.length)} B
`);
  constants.push(
    `/** Inter ${String(wght)}, ${String(subset.length)} B TTF. */\nexport const ${name} =\n  "${subset.toString("base64")}";`,
  );
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(
  OUT_MODULE,
  [
    "// GENEROWANY PLIK - nie edytowac recznie. Regeneracja: npm run pdf:font (scripts/pdf-font.mjs).",
    `// Inter (SIL OFL 1.1, Inter-OFL.txt obok), google/fonts@${SOURCE_COMMIT.slice(0, 12)}, okrojony do Latin-1 + Latin Extended-A.`,
    "",
    ...constants,
    "",
  ].join("\n"),
);
await writeFile(OUT_LICENSE, await download(SOURCE_LICENSE));
process.stdout.write(
  `Zapisano ${path.relative(process.cwd(), OUT_MODULE)} i ${path.relative(process.cwd(), OUT_LICENSE)}
`,
);
