/**
 * Laduje miniona historie demo (`supabase/demo/history.sql`) do LOKALNEJ bazy.
 *
 *   npm run db:demo
 *   npm run db:demo:more   (najpierw historia, potem `supabase/demo/more.sql` - wiecej
 *                           jezdzcow, koni i miesiecy; do przeklikania, nie dla testow)
 *
 * Cel jest zaszyty na lokalny stack Supabase i nie da sie go zmienic zmienna
 * srodowiskowa - skrypt pisze jako superuser. Bez `psql` na hoscie idzie przez
 * `docker exec` do kontenera stacku, tak jak `supabase/tests/_psql.sh`.
 * Eksportuje `loadDemoHistory`, z ktorej korzysta setup e2e, oraz `runLocalSql`
 * dla `scripts/shots-day.mjs`.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PSQL_FLAGS = ["-v", "ON_ERROR_STOP=1", "-q"];

/** @returns {string} nazwa kontenera bazy lokalnego stacku (`supabase_db_<project_id>`) */
function dbContainer() {
  const config = readFileSync(path.join(ROOT, "supabase", "config.toml"), "utf8");
  const projectId = /^project_id\s*=\s*"(.*)"/m.exec(config)?.[1];
  if (!projectId) throw new Error("Brak project_id w supabase/config.toml.");
  return `supabase_db_${projectId}`;
}

/**
 * Wykonuje SQL na LOKALNEJ bazie jako superuser; tresc idzie przez stdin w UTF-8.
 * @param {string} sql
 * @param {string[]} [extraFlags] dodatkowe flagi psql, np. `-At` dla samych wartosci
 * @returns {import("node:child_process").SpawnSyncReturns<string>}
 */
export function runLocalSql(sql, extraFlags = []) {
  const flags = [...PSQL_FLAGS, ...extraFlags];
  const hasPsql = spawnSync("psql", ["--version"], { encoding: "utf8" }).status === 0;
  const result = hasPsql
    ? spawnSync("psql", [LOCAL_DB_URL, ...flags], { input: sql, encoding: "utf8" })
    : spawnSync("docker", ["exec", "-i", dbContainer(), "psql", "-U", "postgres", "-d", "postgres", ...flags], {
        input: sql,
        encoding: "utf8",
      });
  if (result.error) throw result.error;
  return result;
}

/**
 * @param {string} file plik w `supabase/demo/`
 * @returns {string} wyjscie psql (podsumowanie zaladowanych danych)
 */
function loadDemoFile(file) {
  const sql = readFileSync(path.join(ROOT, "supabase", "demo", file), "utf8");
  const result = runLocalSql(sql);
  if (result.status !== 0) {
    throw new Error(
      `Nie udalo sie zaladowac ${file}. Czy lokalny stack dziala (npx supabase start)?\n${result.stderr}`,
    );
  }
  return `${result.stderr}${result.stdout}`.trim();
}

/**
 * @returns {string} wyjscie psql (podsumowanie zaladowanej historii)
 */
export function loadDemoHistory() {
  return loadDemoFile("history.sql");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${loadDemoHistory()}\n`);
    if (process.argv.includes("--more")) process.stdout.write(`${loadDemoFile("more.sql")}\n`);
  } catch (error) {
    process.stderr.write(`BLAD: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
