/**
 * Przygotowanie i sprzatanie worktree dla agenta-implementera.
 *
 *   node scripts/agent-worktree.mjs setup <galaz-bazowa> <nowa-galaz>
 *   node scripts/agent-worktree.mjs teardown
 *   node scripts/agent-worktree.mjs prune
 *
 * Uruchamiac z katalogu worktree. `setup` zaklada <nowa-galaz> na czubku <galaz-bazowa>
 * (swiezy worktree stoi zwykle na `main`, nie na galezi integracyjnej) i podpina
 * `node_modules` glownego checkoutu jako junction - bez `npm install`, ktore na tej
 * maszynie zjada pamiec. `teardown` zdejmuje sam junction; wspolny katalog zostaje.
 * `prune` (z glownego checkoutu) zdejmuje junctiony z katalogow `.claude/worktrees/*`,
 * ktorych git juz nie zna jako worktree, i usuwa puste katalogi - pozostawione
 * junctiony mnoza pliki obserwowane przez serwer deweloperski.
 *
 * Junction usuwa wylacznie `teardown`. `rm -rf node_modules` przeszloby przez niego
 * i skasowalo zaleznosci glownego checkoutu.
 */

import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, rmdirSync, symlinkSync, unlinkSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const LINK = path.resolve("node_modules");
const WORKTREES = path.join(".claude", "worktrees");

/**
 * @param {string[]} args
 * @returns {string}
 */
function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} nie powiodlo sie:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

/** @returns {string} katalog glownego checkoutu (pierwszy wpis `git worktree list`) */
function mainCheckout() {
  const first = git(["worktree", "list", "--porcelain"]).split(/\r?\n/)[0] ?? "";
  return path.resolve(first.replace(/^worktree /, ""));
}

/**
 * @param {string} [link]
 * @returns {boolean}
 */
function linkExists(link = LINK) {
  try {
    return lstatSync(link).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Junction na Windows zdejmuje rmdir, symlink na pozostalych systemach unlink;
 * zadne z nich nie wchodzi do katalogu docelowego.
 * @param {string} link
 */
function removeLink(link) {
  if (process.platform === "win32") {
    rmdirSync(link);
  } else {
    unlinkSync(link);
  }
}

/**
 * @param {string} dir
 * @returns {string} sciezka do porownan (Windows nie rozroznia wielkosci liter)
 */
function comparable(dir) {
  const resolved = path.resolve(dir);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/**
 * @param {string | undefined} base
 * @param {string | undefined} branch
 */
function setup(base, branch) {
  if (!base || !branch) {
    throw new Error("Uzycie: node scripts/agent-worktree.mjs setup <galaz-bazowa> <nowa-galaz>");
  }
  const main = mainCheckout();
  if (main === path.resolve(".")) {
    throw new Error("To jest glowny checkout, nie worktree - nic do przygotowania.");
  }
  if (git(["status", "--porcelain"]) !== "") {
    throw new Error("Worktree ma niezapisane zmiany - setup uruchamia sie na czystym worktree.");
  }
  git(["switch", "-c", branch, base]);

  const target = path.join(main, "node_modules");
  if (!existsSync(target)) {
    throw new Error(`Brak ${target} - uruchom \`npm install\` w glownym checkoucie.`);
  }
  if (!linkExists()) {
    if (existsSync(LINK)) {
      throw new Error("node_modules w worktree jest zwyklym katalogiem - usun go recznie.");
    }
    symlinkSync(target, LINK, "junction");
  }
  process.stdout.write(
    `Galaz ${branch} na ${git(["rev-parse", "--short", "HEAD"])} (${base}); node_modules -> ${target}\n`,
  );
}

function teardown() {
  if (!linkExists()) {
    process.stdout.write("Brak junctiona node_modules - nic do zdjecia.\n");
    return;
  }
  removeLink(LINK);
  process.stdout.write("Junction node_modules zdjety; wspolny katalog nietkniety.\n");
}

function prune() {
  if (mainCheckout() !== path.resolve(".")) {
    throw new Error("prune uruchamia sie z glownego checkoutu.");
  }
  if (!existsSync(WORKTREES)) {
    process.stdout.write(`Brak ${WORKTREES} - nic do sprzatania.\n`);
    return;
  }
  git(["worktree", "prune"]);
  const known = new Set(
    git(["worktree", "list", "--porcelain"])
      .split(/\r?\n/)
      .filter((line) => line.startsWith("worktree "))
      .map((line) => comparable(line.slice("worktree ".length))),
  );
  for (const name of readdirSync(WORKTREES)) {
    const dir = path.join(WORKTREES, name);
    if (known.has(comparable(dir)) || !lstatSync(dir).isDirectory()) {
      continue;
    }
    const link = path.join(dir, "node_modules");
    if (linkExists(link)) {
      removeLink(link);
      process.stdout.write(`${dir}: junction node_modules zdjety.\n`);
    }
    if (readdirSync(dir).length === 0) {
      rmdirSync(dir);
      process.stdout.write(`${dir}: pusty katalog usuniety.\n`);
    } else {
      process.stdout.write(`${dir}: zostaje - ma pliki, przejrzyj go recznie.\n`);
    }
  }
}

try {
  const [command, base, branch] = process.argv.slice(2);
  if (command === "setup") {
    setup(base, branch);
  } else if (command === "teardown") {
    teardown();
  } else if (command === "prune") {
    prune();
  } else {
    throw new Error("Uzycie: node scripts/agent-worktree.mjs <setup <galaz-bazowa> <nowa-galaz> | teardown | prune>");
  }
} catch (error) {
  process.stderr.write(`BLAD: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
