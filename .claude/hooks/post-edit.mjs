// Hook PostToolUse (Claude Code) dla Write|Edit - test-plan §3 faza 3, §6.6.
//
// Kontrakt (docs: https://code.claude.com/docs/en/hooks.md):
// - stdin: JSON z `cwd` i `tool_input.file_path` (sciezka bezwzgledna, na Windows z backslashami);
// - wyjscie 2 + stderr -> tekst trafia do kontekstu agenta (blokujaca informacja zwrotna);
// - wyjscie 0 + JSON `hookSpecificOutput.additionalContext` na stdout -> notatka dla agenta;
// - zwykly stdout przy wyjsciu 0 agent NIE widzi; wyjscie 1 = blad samego hooka (widoczny, nieblokujacy).
//
// Co robi: (A) prettier na zapisanym pliku; (B) w obszarach ryzyka `vitest related --run`,
// a gdy zaden test nie importuje pliku - cala suita jednostkowa (~2 s) plus notatka,
// ktora bramka (test:e2e / test:db) naprawde chroni ten plik. Bez ESLinta: lint typowany
// kosztuje 7-9 s na plik i biegnie w lint-staged (commit) oraz w CI.
//
// Budzet: <= 5 s na pliku z obszaru ryzyka, <= 2 s poza nim. Nigdy cala suita e2e/db.
// Plik jest lintowany typowo (tsconfig include), stad JSDoc i zawezanie `unknown`.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const RISK_AREAS = ["src/lib/bookings/", "src/lib/schedule/", "src/pages/api/"];
// Plik generowany przez `npm run db:types` - wykluczony z ESLinta w eslint.config.js; tu tez.
const SKIP_FILES = new Set(["src/db/database.types.ts"]);
const MAX_OUTPUT_CHARS = 4000;

/** @returns {unknown} */
function readInput() {
  const text = readFileSync(0, "utf8");
  return text.trim() === "" ? {} : JSON.parse(text);
}

/**
 * @param {unknown} value
 * @param {string} key
 * @returns {unknown}
 */
function field(value, key) {
  if (typeof value !== "object" || value === null) return undefined;
  return /** @type {Record<string, unknown>} */ (value)[key];
}

/**
 * @param {string} root
 * @param {string[]} args
 * @returns {{ status: number | null, output: string }}
 */
function runNode(root, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/**
 * @param {string} label
 * @param {string} relative
 * @param {string} output
 */
function fail(label, relative, output) {
  const tail = output.length > MAX_OUTPUT_CHARS ? `…${output.slice(-MAX_OUTPUT_CHARS)}` : output;
  process.stderr.write(`[post-edit hook] ${label} failed for ${relative}\n${tail}\n`);
  return 2;
}

function main() {
  const input = readInput();
  const filePath = field(field(input, "tool_input"), "file_path");
  if (typeof filePath !== "string" || filePath === "") return 0;

  const projectDir = process.env.CLAUDE_PROJECT_DIR;
  const cwd = field(input, "cwd");
  const root = path.resolve(
    projectDir !== undefined && projectDir !== "" ? projectDir : typeof cwd === "string" ? cwd : process.cwd(),
  );
  const absolute = path.resolve(root, filePath);
  const relative = path.relative(root, absolute).split(path.sep).join("/");

  const outsideProject = relative.startsWith("..") || path.isAbsolute(relative);
  if (outsideProject || SKIP_FILES.has(relative) || !existsSync(absolute)) return 0;

  // (A) Formatowanie. Prettier honoruje .gitignore; --ignore-unknown = brak parsera to nie blad.
  const prettier = runNode(root, [
    path.join(root, "node_modules/prettier/bin/prettier.cjs"),
    "--write",
    "--ignore-unknown",
    relative,
  ]);
  if (prettier.status !== 0) return fail("prettier", relative, prettier.output);

  // (B) Testy powiazane - tylko obszary ryzyka i tylko .ts (vitest.config: src/**/*.test.ts).
  const inRiskArea = RISK_AREAS.some((area) => relative.startsWith(area)) && relative.endsWith(".ts");
  if (!inRiskArea) return 0;

  const vitest = path.join(root, "node_modules/vitest/vitest.mjs");
  const related = runNode(root, [vitest, "related", relative, "--run"]);
  if (related.status !== 0) return fail("vitest related", relative, related.output);
  if (!related.output.includes("No test files found")) return 0;

  // Zaden test jednostkowy nie importuje pliku (np. src/pages/api/**, queries.ts): odpal cala
  // suite (~2 s), zeby nie udawac zielonego, i nazwij bramke, ktora ten plik naprawde chroni.
  const full = runNode(root, [vitest, "run"]);
  if (full.status !== 0) return fail("vitest run", relative, full.output);

  const gate = relative.startsWith("src/pages/api/")
    ? "npm run test:e2e"
    : "npm run test:db and npm run test:e2e (with the local stack: npx supabase start; npx supabase db reset)";
  const note = `No unit test imports ${relative}; the whole unit suite passed instead. This file is covered by ${gate} - run it before pushing.`;
  process.stdout.write(
    `${JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: note } })}\n`,
  );
  return 0;
}

try {
  process.exit(main());
} catch (error) {
  // Blad samego hooka: widoczny, ale nieblokujacy (kod 1). Nigdy nie udajemy sukcesu.
  process.stderr.write(`[post-edit hook] internal error: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
}
