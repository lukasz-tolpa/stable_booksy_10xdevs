#!/usr/bin/env node
// Shim dla `npm run test:db`: uruchamia run_all.sh wlasciwym bashem.
//
// Na Windows `bash` widoczny z cmd/PowerShell (czyli z `npm run`) bywa launcherem WSL
// (C:\Windows\System32\bash.exe) bez zainstalowanej dystrybucji - wtedy skrypt bash
// nie ma czym sie wykonac. Szukamy wiec Git Bash: obok `git` z PATH albo w typowych
// katalogach instalacji. Na Linux/macOS (w tym runner CI) wolamy `bash` z PATH.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "run_all.sh");

function findGitBash() {
  const candidates = [];

  const where = spawnSync("where.exe", ["git"], { encoding: "utf8" });
  if (where.status === 0) {
    for (const gitExe of where.stdout.split(/\r?\n/).filter(Boolean)) {
      // <Git>\cmd\git.exe -> <Git>\bin\bash.exe
      candidates.push(resolve(gitExe, "..", "..", "bin", "bash.exe"));
    }
  }

  for (const base of [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs") : undefined,
  ]) {
    if (base) candidates.push(join(base, "Git", "bin", "bash.exe"));
  }

  return candidates.find((candidate) => existsSync(candidate));
}

const bash = process.platform === "win32" ? findGitBash() : "bash";

if (!bash) {
  process.stderr.write(
    "BLAD: nie znaleziono Git Bash (bin\\bash.exe). Zainstaluj Git for Windows albo uruchom " +
      "`bash supabase/tests/run_all.sh` z terminala Git Bash.\n",
  );
  process.exit(1);
}

const result = spawnSync(bash, [script], { stdio: "inherit", env: process.env });

if (result.error) {
  process.stderr.write(`BLAD: nie udalo sie uruchomic ${bash}: ${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
