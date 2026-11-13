/**
 * Przygotowanie i sprzatanie worktree dla agenta-implementera.
 *
 *   node scripts/agent-worktree.mjs setup <galaz-bazowa> <nowa-galaz>
 *   node scripts/agent-worktree.mjs teardown
 *
 * Uruchamiac z katalogu worktree. `setup` zaklada <nowa-galaz> na czubku <galaz-bazowa>
 * (swiezy worktree stoi zwykle na `main`, nie na galezi integracyjnej) i podpina
 * `node_modules` glownego checkoutu jako junction - bez `npm install`, ktore na tej
 * maszynie zjada pamiec. `teardown` zdejmuje sam junction; wspolny katalog zostaje.
 *
 * Junction usuwa wylacznie `teardown`. `rm -rf node_modules` przeszloby przez niego
 * i skasowalo zaleznosci glownego checkoutu.
 */

import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, rmdirSync, symlinkSync, unlinkSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const LINK = path.resolve("node_modules");

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

/** @returns {boolean} */
function linkExists() {
  try {
    return lstatSync(LINK).isSymbolicLink();
  } catch {
    return false;
  }
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
  // Junction na Windows zdejmuje rmdir, symlink na pozostalych systemach unlink;
  // zadne z nich nie wchodzi do katalogu docelowego.
  if (process.platform === "win32") {
    rmdirSync(LINK);
  } else {
    unlinkSync(LINK);
  }
  process.stdout.write("Junction node_modules zdjety; wspolny katalog nietkniety.\n");
}

try {
  const [command, base, branch] = process.argv.slice(2);
  if (command === "setup") {
    setup(base, branch);
  } else if (command === "teardown") {
    teardown();
  } else {
    throw new Error("Uzycie: node scripts/agent-worktree.mjs <setup <galaz-bazowa> <nowa-galaz> | teardown>");
  }
} catch (error) {
  process.stderr.write(`BLAD: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
