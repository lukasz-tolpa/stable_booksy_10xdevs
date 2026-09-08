# Wspolna detekcja klienta psql dla skryptow w supabase/tests/.
#
# Source'owac (nie uruchamiac):  source "$(dirname "${BASH_SOURCE[0]}")/_psql.sh"
#
# Ustawia:
#   DB_URL         - adres bazy (domyslnie lokalny stack Supabase, port z config.toml)
#   PSQL_MODE      - "host" (psql na hoscie, np. runner CI) albo "docker" (psql w kontenerze
#                    lokalnego stacku - domyslne na maszynie bez zainstalowanego klienta)
#   psql_run ...   - wrapper: `psql_run -c '...'`, `psql_run < plik.sql`, flagi jak w psql
#   q '<select>'   - jednowierszowy odczyt bez naglowka i znakow nowej linii
#
# Nazwa kontenera pochodzi od project_id z supabase/config.toml (supabase_db_<project_id>).
# Pliki .sql podawaj przez stdin (`psql_run < plik`), nie `-f` - dziala identycznie w obu
# trybach i omija przepisywanie sciezek przez Git Bash na Windows.

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
_PSQL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v psql >/dev/null 2>&1; then
  PSQL_MODE="host"
  psql_run() { psql "$DB_URL" "$@"; }
else
  _PROJECT_ID="$(sed -nE 's/^project_id[[:space:]]*=[[:space:]]*"(.*)".*/\1/p' "$_PSQL_DIR/../config.toml" | head -1)"
  PSQL_CONTAINER="supabase_db_${_PROJECT_ID}"
  if ! docker inspect "$PSQL_CONTAINER" >/dev/null 2>&1; then
    echo "BLAD: brak psql na hoscie i brak kontenera $PSQL_CONTAINER. Uruchom 'npx supabase start'." >&2
    return 1 2>/dev/null || exit 1
  fi
  PSQL_MODE="docker"
  psql_run() { docker exec -i "$PSQL_CONTAINER" psql -U postgres -d postgres "$@"; }
fi

q() { psql_run -tAq -c "$1" | tr -d '\r\n'; }
