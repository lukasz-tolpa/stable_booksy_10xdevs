/**
 * Zdjęcie hero landingu: PNG z eksportu OpenDesign -> webp w budżecie <= 200 KB.
 *
 * Uruchamiane ręcznie, raz; wynik (`public/hero.webp`) jest commitowany. Build NIGDY
 * nie odpala tego skryptu i nie czyta z `context/` - folder zmiany trafi kiedyś do
 * archiwum, a `public/` musi być samowystarczalne.
 *
 *   node scripts/hero.mjs
 *
 * Źródło: context/changes/ui-redesign/design/hero.png (1536x1024, 2,12 MB).
 * Wynik przy jakości 80 i pełnej szerokości źródła: ~122 KB.
 */

import { statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const SOURCE = "context/changes/ui-redesign/design/hero.png";
const TARGET = "public/hero.webp";
const QUALITY = 80;
const BUDGET_KB = 200;

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, SOURCE);
const target = path.join(root, TARGET);

const info = await sharp(source).webp({ quality: QUALITY }).toFile(target);
const kb = Math.round(statSync(target).size / 1024);

process.stdout.write(
  `${TARGET}: ${String(info.width)}x${String(info.height)} webp q${String(QUALITY)}, ${String(kb)} KB\n`,
);

if (kb > BUDGET_KB) {
  process.stderr.write(`Przekroczony budżet ${String(BUDGET_KB)} KB - zmniejsz jakość albo szerokość.\n`);
  process.exitCode = 1;
}
