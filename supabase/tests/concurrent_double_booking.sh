#!/usr/bin/env bash
#
# Dowod NFR wspolbieznosci (F-01): przy N jednoczesnych probach zapisu na ten sam
# slot konia dokladnie jedna konczy sie sukcesem, a pozostale dostaja 23505.
#
# Weryfikacja w jednej sesji dowodzi tylko, ze indeks istnieje. Ten skrypt dowodzi
# wymagania z PRD - odpornosci na rownolegle zadania z osobnych polaczen.
#
# Wymaga uruchomionego lokalnego stacku (`npx supabase start`) i swiezego seeda.
# Uzycie:  npm run test:db                                   (wszystkie dowody, z runnerem)
#          bash supabase/tests/concurrent_double_booking.sh  (tylko ten skrypt)
# Zmienne: ATTEMPTS (domyslnie 5), DB_URL (patrz _psql.sh)

set -uo pipefail

ATTEMPTS="${ATTEMPTS:-5}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Klient psql (host albo kontener lokalnego stacku) - wspolna detekcja w _psql.sh.
# shellcheck source=_psql.sh
source "$SCRIPT_DIR/_psql.sh" || exit 1

DAY_ID="$(q "select sd.id from public.schedule_days sd join public.stables s on s.id = sd.stable_id where s.name = 'Stadnina Pod Debem' order by sd.day limit 1")"
HORSE_ID="$(q "select h.id from public.horses h join public.stables s on s.id = h.stable_id where s.name = 'Stadnina Pod Debem' and h.name = 'Kasztan'")"
RIDER_ID="$(q "select id from public.profiles where full_name = 'Anna Kowalska'")"
HOUR=12

if [ -z "$DAY_ID" ] || [ -z "$HORSE_ID" ] || [ -z "$RIDER_ID" ]; then
  echo "BLAD: brak danych demo. Uruchom 'npx supabase db reset'." >&2
  exit 1
fi

echo "Slot testowy: dzien=$DAY_ID kon=$HORSE_ID (Kasztan) godzina=$HOUR, prob=$ATTEMPTS"

# Czyscimy slot, zeby skrypt byl powtarzalny.
psql_run -q -c "delete from public.bookings where schedule_day_id = $DAY_ID and horse_id = $HORSE_ID and hour = $HOUR" >/dev/null

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# pg_sleep daje wszystkim polaczeniom czas na zestawienie sie, zanim ktorykolwiek
# wystrzeli INSERT - bez tego proby moglyby sie rozjechac w czasie i nie kolidowac.
pids=()
for i in $(seq 1 "$ATTEMPTS"); do
  psql_run -v ON_ERROR_STOP=1 -q -c \
    "select pg_sleep(0.5); insert into public.bookings (schedule_day_id, horse_id, hour, rider_id) values ($DAY_ID, $HORSE_ID, $HOUR, '$RIDER_ID');" \
    >"$TMP/out_$i" 2>"$TMP/err_$i" &
  pids+=("$!")
done

successes=0
failures=0
for pid in "${pids[@]}"; do
  if wait "$pid"; then
    successes=$((successes + 1))
  else
    failures=$((failures + 1))
  fi
done

active="$(q "select count(*) from public.bookings where schedule_day_id = $DAY_ID and horse_id = $HORSE_ID and hour = $HOUR and status = 'active'")"
wrong_error="$(grep -L "bookings_active_slot_key" "$TMP"/err_* 2>/dev/null | xargs -r -I{} sh -c 'test -s "{}" && echo "{}"' | wc -l | tr -d ' ')"

echo "Sukcesy: $successes | Odmowy: $failures | Aktywne zapisy na slocie: $active"

status=0
if [ "$successes" -ne 1 ]; then
  echo "FAIL: oczekiwano dokladnie 1 sukcesu, bylo $successes" >&2
  status=1
fi
if [ "$active" -ne 1 ]; then
  echo "FAIL: oczekiwano dokladnie 1 aktywnego zapisu, jest $active" >&2
  status=1
fi
if [ "$failures" -gt 0 ] && [ "$wrong_error" -gt 0 ]; then
  echo "FAIL: $wrong_error odmow z innego powodu niz naruszenie bookings_active_slot_key" >&2
  cat "$TMP"/err_* >&2
  status=1
fi

# Przywracamy stan z seeda.
psql_run -q -c "delete from public.bookings where schedule_day_id = $DAY_ID and horse_id = $HORSE_ID and hour = $HOUR" >/dev/null

if [ "$status" -eq 0 ]; then
  echo "PASS: dokladnie jeden zapis przeszedl, pozostale odrzucone przez bookings_active_slot_key"
fi
exit "$status"
