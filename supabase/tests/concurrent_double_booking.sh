#!/usr/bin/env bash
#
# Dowod NFR wspolbieznosci (PRD: "przy jednoczesnych probach zapisu na ten sam slot
# konia tylko jeden zapis konczy sie sukcesem; pozostale otrzymuja czytelna odmowe").
#
# Przy N jednoczesnych probach zapisu na jeden slot (dzien, kon, godzina) z osobnych
# polaczen dokladnie jedna przechodzi, a pozostale dostaja 23505 na indeksie czesciowym
# bookings_active_slot_key. Weryfikacja w jednej sesji dowodzi tylko, ze indeks istnieje;
# ten skrypt dowodzi odpornosci na rownolegle zadania.
#
# Jako kto: proby ida przez RLS jako jezdzcy z seeda - nieparzyste jako Anna Kowalska,
# parzyste jako Piotr Nowak (`set role authenticated` + `request.jwt.claims`, `rider_id`
# rowny `sub` z claims - tak wymaga polityka bookings_insert_own_as_rider). Przygotowanie
# danych i odczyt kontrolny ida jako postgres. Odmowa z innym kodem niz 23505 (np. 42501
# z RLS, 23503/23514 z triggerow) to blad konfiguracji testu, nie dowod - konczy sie FAIL.
#
# Druga polowa dowodu: odwolanie zwyciezcy zwalnia slot (predykat `status = 'active'`
# indeksu czesciowego, nie sama unikalnosc) - ponowny zapis przechodzi, a get_taken_slots
# widziane przez jezdzca pokazuje dokladnie jedna pare (kon, godzina) dla tego slotu.
#
# Wymaga uruchomionego lokalnego stacku (`npx supabase start`) i swiezego seeda.
# Uzycie:  npm run test:db                                   (wszystkie dowody, z runnerem)
#          bash supabase/tests/concurrent_double_booking.sh  (tylko ten skrypt)
# Zmienne: ATTEMPTS (domyslnie 5), BARRIER_SECONDS (domyslnie 0.5; CI: 1), DB_URL (patrz _psql.sh)

set -uo pipefail

ATTEMPTS="${ATTEMPTS:-5}"
# Bariera (sekundy) - ile kazde polaczenie czeka przed INSERT, zeby wszystkie N procesow
# psql zdazylo sie zestawic i proby naprawde sie nakladaly. Na zimnym runnerze CI spawn
# bywa wolniejszy, stad tam 1 s (ci.yml). Asercja jest prawdziwa takze przy
# zserializowanych probach (indeks odrzuca spoznionych), ale wtedy test nie dowodzi
# wspolbieznosci - dlatego bariera ma byc dluzsza niz spawn, nie krotsza.
BARRIER_SECONDS="${BARRIER_SECONDS:-0.5}"
case "$BARRIER_SECONDS" in
  ''|*[!0-9.]*|*.*.*) echo "BLAD: BARRIER_SECONDS musi byc liczba (np. 0.5 albo 1), jest: '$BARRIER_SECONDS'" >&2; exit 1 ;;
esac
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Klient psql (host albo kontener lokalnego stacku) - wspolna detekcja w _psql.sh.
# shellcheck source=_psql.sh
source "$SCRIPT_DIR/_psql.sh" || exit 1

STABLE_ID="$(q "select id from public.stables where name = 'Stadnina Pod Debem'")"
DAY_ID="$(q "select id from public.schedule_days where stable_id = ${STABLE_ID:-0} and day = current_date + 1")"
DAY_DATE="$(q "select day from public.schedule_days where id = ${DAY_ID:-0}")"
HORSE_ID="$(q "select id from public.horses where stable_id = ${STABLE_ID:-0} and name = 'Kasztan'")"
ANNA_ID="$(q "select id from public.profiles where full_name = 'Anna Kowalska'")"
PIOTR_ID="$(q "select id from public.profiles where full_name = 'Piotr Nowak'")"
HOUR=12

if [ -z "$STABLE_ID" ] || [ -z "$DAY_ID" ] || [ -z "$HORSE_ID" ] || [ -z "$ANNA_ID" ] || [ -z "$PIOTR_ID" ]; then
  echo "BLAD: brak danych demo. Uruchom 'npx supabase db reset'." >&2
  exit 1
fi

# Polecenie wykonywane w kontekscie jezdzca: SET ROLE + claims + wlasciwe SQL w jednym
# `-c`, czyli w jednej transakcji implicit - tak RLS widzi je jak zapytanie z aplikacji.
as_rider_sql() {
  local rider_id="$1" sql="$2"
  printf "set role authenticated; set request.jwt.claims = '{\"sub\":\"%s\",\"role\":\"authenticated\"}'; %s" "$rider_id" "$sql"
}

insert_sql() {
  local rider_id="$1"
  printf "insert into public.bookings (schedule_day_id, horse_id, hour, rider_id) values (%s, %s, %s, '%s');" \
    "$DAY_ID" "$HORSE_ID" "$HOUR" "$rider_id"
}

echo "Slot testowy: dzien=$DAY_ID ($DAY_DATE) kon=$HORSE_ID (Kasztan) godzina=$HOUR, prob=$ATTEMPTS (Anna/Piotr naprzemiennie)"

# Czyscimy slot, zeby skrypt byl powtarzalny.
cleanup() {
  psql_run -q -c "delete from public.bookings where schedule_day_id = $DAY_ID and horse_id = $HORSE_ID and hour = $HOUR" >/dev/null
}
cleanup

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; cleanup' EXIT

# pg_sleep daje wszystkim polaczeniom czas na zestawienie sie, zanim ktorykolwiek
# wystrzeli INSERT - bez tego proby moglyby sie rozjechac w czasie i nie kolidowac.
pids=()
for i in $(seq 1 "$ATTEMPTS"); do
  if [ $((i % 2)) -eq 1 ]; then rider="$ANNA_ID"; else rider="$PIOTR_ID"; fi
  psql_run -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -q -c \
    "$(as_rider_sql "$rider" "select pg_sleep($BARRIER_SECONDS); $(insert_sql "$rider")")" \
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

# Kazda odmowa musi byc 23505 na bookings_active_slot_key. Inny kod (42501 z RLS,
# 23503/23514 z triggerow) oznacza, ze test mierzy cos innego niz dubel.
wrong_error=0
for f in "$TMP"/err_*; do
  [ -s "$f" ] || continue
  if ! grep -q "23505" "$f" || ! grep -q "bookings_active_slot_key" "$f"; then
    wrong_error=$((wrong_error + 1))
  fi
done

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
if [ "$wrong_error" -gt 0 ]; then
  echo "FAIL: $wrong_error odmow z innego powodu niz 23505 na bookings_active_slot_key:" >&2
  cat "$TMP"/err_* >&2
  status=1
fi

# --- Zwolnienie slotu: odwolanie zwyciezcy musi wypuscic slot z indeksu czesciowego. ---
if [ "$status" -eq 0 ]; then
  psql_run -q -c "update public.bookings set status = 'cancelled', cancelled_at = now() where schedule_day_id = $DAY_ID and horse_id = $HORSE_ID and hour = $HOUR and status = 'active'" >/dev/null

  if psql_run -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -q -c "$(as_rider_sql "$ANNA_ID" "$(insert_sql "$ANNA_ID")")" >/dev/null 2>"$TMP/err_release"; then
    echo "Zwolnienie slotu: po odwolaniu zwyciezcy ponowny zapis Anny przeszedl"
  else
    echo "FAIL: po odwolaniu zwyciezcy ponowny zapis na ten sam slot odrzucony:" >&2
    cat "$TMP/err_release" >&2
    status=1
  fi

  active_after="$(q "select count(*) from public.bookings where schedule_day_id = $DAY_ID and horse_id = $HORSE_ID and hour = $HOUR and status = 'active'")"
  if [ "$active_after" -ne 1 ]; then
    echo "FAIL: po zwolnieniu i ponownym zapisie oczekiwano 1 aktywnego, jest $active_after" >&2
    status=1
  fi

  # Zajetosc widziana przez jezdzca: dokladnie jedna para (Kasztan, 12) - bez asercji na
  # laczna liczbe wierszy, bo funkcja zwraca tez seedowy zapis Anny (Bella o 11).
  taken="$(psql_run -tAq -c "$(as_rider_sql "$ANNA_ID" "select count(*) from public.get_taken_slots($STABLE_ID, date '$DAY_DATE') where horse_id = $HORSE_ID and hour = $HOUR;")" | tr -d '\r\n')"
  if [ "$taken" != "1" ]; then
    echo "FAIL: get_taken_slots jako jezdziec pokazuje $taken wierszy dla (Kasztan, $HOUR) zamiast 1" >&2
    status=1
  else
    echo "Zajetosc: get_taken_slots jako Anna pokazuje dokladnie jedna pare (Kasztan, $HOUR)"
  fi
fi

if [ "$status" -eq 0 ]; then
  echo "PASS: dokladnie jeden zapis przeszedl przez RLS, pozostale odrzucone przez 23505 bookings_active_slot_key; odwolanie zwolnilo slot"
fi
exit "$status"
