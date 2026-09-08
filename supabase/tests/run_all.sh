#!/usr/bin/env bash
#
# Runner dowodow gwarancji bazodanowych (context/foundation/test-plan.md, §3 faza 1).
# Uruchamia po kolei wszystkie skrypty z tego katalogu i konczy kodem 1, jesli
# ktorykolwiek padl. Wykonuje wszystkie, nie przerywa na pierwszym - log z CI ma
# pokazac pelny obraz.
#
# Uzycie:  npm run test:db
#   lokalnie: dzialajacy stack (`npx supabase start`) i seed z DZISIAJ (`npx supabase db reset`)
#   w CI:     po `npx supabase db start` (sam Postgres z migracjami i seedem)
# Zmienne:  DB_URL (patrz _psql.sh), ATTEMPTS (skrypt wspolbieznosci)
#
# Seed liczy `current_date + 1` w chwili ladowania; po dobie dni z seeda to "dzis"
# i filtry `current_date + 1` w skryptach nic nie znajduja. Dlatego runner sprawdza
# swiezosc seeda i odmawia z komunikatem zamiast dawac falszywe wyniki.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_psql.sh
source "$SCRIPT_DIR/_psql.sh" || exit 1

echo "Klient psql: $PSQL_MODE${PSQL_CONTAINER:+ ($PSQL_CONTAINER)}"

# 1. Gotowosc bazy - na zimnym runnerze pierwsze polaczenie po starcie bywa odrzucane.
ready=0
for _ in $(seq 1 30); do
  if psql_run -tAq -c 'select 1' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "BLAD: baza nie odpowiada (DB_URL=$DB_URL). Uruchom 'npx supabase start' albo 'npx supabase db start'." >&2
  exit 1
fi

# 2. Swiezosc seeda.
fresh="$(q "select exists (select 1 from public.schedule_days where day = current_date + 1)")"
if [ "$fresh" != "t" ]; then
  echo "BLAD: Seed jest nieaktualny (dni z seeda nie sa na jutro). Uruchom 'npx supabase db reset'." >&2
  exit 1
fi

# 3. Skrypty - kolejnosc ma znaczenie: dwa pierwsze cofaja zmiany (ROLLBACK),
#    skrypt wspolbieznosci pisze do bazy i sprzata po sobie, wiec idzie ostatni.
run_sql() { psql_run -v ON_ERROR_STOP=1 -q < "$SCRIPT_DIR/$1"; }

results=()
failures=0
run_one() {
  local name="$1"
  shift
  echo
  echo "### $name"
  if "$@"; then
    results+=("PASS  $name")
  else
    results+=("FAIL  $name")
    failures=$((failures + 1))
  fi
}

run_one "rls_isolation.sql" run_sql rls_isolation.sql
run_one "schedule_change_guardrails.sql" run_sql schedule_change_guardrails.sql
run_one "concurrent_double_booking.sh" bash "$SCRIPT_DIR/concurrent_double_booking.sh"

echo
echo "=== Podsumowanie ==="
printf '%s\n' "${results[@]}"

if [ "$failures" -gt 0 ]; then
  echo "FAIL: $failures z ${#results[@]} skryptow nie przeszlo" >&2
  exit 1
fi
echo "PASS: wszystkie dowody gwarancji bazodanowych przeszly"
exit 0
