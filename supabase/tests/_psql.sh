# Wspolna detekcja klienta psql dla skryptow w supabase/tests/.
#
# Source'owac (nie uruchamiac):  source "$(dirname "${BASH_SOURCE[0]}")/_psql.sh"
#
# Ustawia:
#   DB_URL         - adres bazy (domyslnie lokalny stack Supabase, port z config.toml)
#   PSQL_TARGET    - opis celu do komunikatow (DB_URL=... albo nazwa kontenera)
#   PSQL_MODE      - "host" (psql na hoscie, np. runner CI) albo "docker" (psql w kontenerze
#                    lokalnego stacku - domyslne na maszynie bez zainstalowanego klienta)
#   psql_run ...   - wrapper: `psql_run -c '...'`, `psql_run < plik.sql`, flagi jak w psql
#   q '<select>'   - jednowierszowy odczyt bez naglowka i znakow nowej linii
#
# Nazwa kontenera pochodzi od project_id z supabase/config.toml (supabase_db_<project_id>).
# Pliki .sql podawaj przez stdin (`psql_run < plik`), nie `-f` - dziala identycznie w obu
# trybach i omija przepisywanie sciezek przez Git Bash na Windows.

_DB_URL_EXPLICIT="${DB_URL:+1}"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
_PSQL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Straznik hosta: skrypty mutuja jako superuser (cleanup skryptu wspolbieznosci robi
# DELETE z bookings), a straznik swiezosci seeda przejdzie na kazdej bazie z grafikiem
# na jutro - takze produkcyjnej. Zdalny host tylko z jawnym DB_TESTS_ALLOW_REMOTE=1.
# Host z URL bez sed/regex: sciagamy schemat, userinfo (do ostatniego @), sciezke,
# query i port; adres IPv6 w nawiasach zostaje w calosci.
_DB_HOST="${DB_URL#*://}"
_DB_HOST="${_DB_HOST##*@}"
_DB_HOST="${_DB_HOST%%/*}"
_DB_HOST="${_DB_HOST%%"?"*}"
case "$_DB_HOST" in
  "["*) _DB_HOST="${_DB_HOST%%]*}]" ;;
  *)    _DB_HOST="${_DB_HOST%%:*}" ;;
esac
case "$_DB_HOST" in
  localhost|127.0.0.1|"[::1]") ;;
  *)
    if [ "${DB_TESTS_ALLOW_REMOTE:-0}" != "1" ]; then
      echo "BLAD: DB_URL wskazuje na host '${_DB_HOST:-?}', a testy mutuja dane jako superuser." >&2
      echo "      Testy sa dla lokalnego stacku. Zdalna baza wylacznie z DB_TESTS_ALLOW_REMOTE=1." >&2
      return 1 2>/dev/null || exit 1
    fi
    ;;
esac

if command -v psql >/dev/null 2>&1; then
  PSQL_MODE="host"
  PSQL_TARGET="DB_URL=$DB_URL"
  psql_run() { psql "$DB_URL" "$@"; }
else
  _PROJECT_ID="$(sed -nE 's/^project_id[[:space:]]*=[[:space:]]*"(.*)".*/\1/p' "$_PSQL_DIR/../config.toml" | head -1)"
  PSQL_CONTAINER="supabase_db_${_PROJECT_ID}"
  if ! docker inspect "$PSQL_CONTAINER" >/dev/null 2>&1; then
    echo "BLAD: brak psql na hoscie i brak kontenera $PSQL_CONTAINER. Uruchom 'npx supabase start'." >&2
    return 1 2>/dev/null || exit 1
  fi
  PSQL_MODE="docker"
  PSQL_TARGET="kontener $PSQL_CONTAINER"
  if [ -n "$_DB_URL_EXPLICIT" ]; then
    echo "UWAGA: brak psql na hoscie - DB_URL zostanie zignorowany, testy ida przez 'docker exec $PSQL_CONTAINER'." >&2
  fi
  psql_run() { docker exec -i "$PSQL_CONTAINER" psql -U postgres -d postgres "$@"; }
fi

q() { psql_run -tAq -c "$1" | tr -d '\r\n'; }
