#!/usr/bin/env bash
#
# Dowod limitu miejsc przy rownoleglych zapisach (#41, ADR-0002; PRD: "przy jednoczesnych
# zapisach wielu osob na ostatnie miejsce udaje sie tylko jeden").
#
# Przy N jednoczesnych probach zapisu na jeden slot (dzien, instruktor, godzina) z limitem
# SEATS < N, z osobnych polaczen i od N roznych jezdzcow, udaje sie DOKLADNIE SEATS prob,
# a pozostale dostaja SB009 (brak miejsc) z wyzwalacza bookings_seat_limit. Wyzwalacz blokuje
# wiersz slotu (FOR UPDATE), wiec liczenie aktywnych zapisow nie widzi stanu sprzed cudzego
# zapisu. Weryfikacja w jednej sesji dowodzi tylko, ze wyzwalacz istnieje; ten skrypt dowodzi
# odpornosci na rownolegle zadania.
#
# Jako kto: proby ida przez RLS jako N tymczasowych jezdzcow (konta zakladane w auth.users -
# profil zaklada handle_new_user; kazdy jezdziec inny, bo jeden jezdziec ma najwyzej jeden zapis
# na godzine). Przygotowanie danych i odczyt kontrolny jako postgres. Odmowa z innym kodem niz
# SB009 (np. 42501 z RLS, 23505 z indeksu jezdzca) to blad konfiguracji testu - FAIL.
#
# Druga polowa dowodu: odwolanie jednego zwyciezcy zwalnia miejsce - przegrany zapisuje sie
# ponownie, a get_slot_occupancy widziane przez jezdzca pokazuje dokladnie SEATS zajetych miejsc.
#
# Sprzatanie (takze po bledzie): usuniecie tymczasowych kont kasuje ich przyszle zapisy
# (wyzwalacz anonimizacji z ADR-0001), a limit slotu wraca do wartosci z seeda.
#
# Wymaga uruchomionego lokalnego stacku (`npx supabase start`) i swiezego seeda.
# Uzycie:  npm run test:db                                 (wszystkie dowody, z runnerem)
#          bash supabase/tests/concurrent_seat_booking.sh  (tylko ten skrypt)
# Zmienne: ATTEMPTS (domyslnie 5), SEATS (domyslnie 2), BARRIER_SECONDS (domyslnie 0.5; CI: 1),
#          HOLD_SECONDS (domyslnie 0.3), DB_URL (patrz _psql.sh)

set -uo pipefail

ATTEMPTS="${ATTEMPTS:-5}"
SEATS="${SEATS:-2}"
# Bariera (sekundy) - ile kazde polaczenie czeka przed INSERT, zeby wszystkie N procesow
# psql zdazylo sie zestawic i proby naprawde sie nakladaly. Na zimnym runnerze CI spawn
# bywa wolniejszy, stad tam 1 s (ci.yml).
BARRIER_SECONDS="${BARRIER_SECONDS:-0.5}"
# Przytrzymanie (sekundy) - ile kazda transakcja czeka PO zapisie, a przed zatwierdzeniem.
# Bez niego INSERT i COMMIT trwaja ulamek milisekundy i proby rozjezdzaja sie w czasie nawet
# bez blokady slotu; z nim kazda proba liczy zajetosc, gdy cudze zapisy nie sa jeszcze
# zatwierdzone - wtedy dokladnie SEATS sukcesow daje wylacznie blokada wiersza slotu.
HOLD_SECONDS="${HOLD_SECONDS:-0.3}"
for value in "$BARRIER_SECONDS" "$HOLD_SECONDS"; do
  case "$value" in
    ''|*[!0-9.]*|*.*.*) echo "BLAD: BARRIER_SECONDS i HOLD_SECONDS musza byc liczbami (np. 0.5 albo 1), jest: '$value'" >&2; exit 1 ;;
  esac
done
if [ "$SEATS" -ge "$ATTEMPTS" ] || [ "$SEATS" -lt 1 ] || [ "$SEATS" -gt 2 ]; then
  echo "BLAD: wymagane 1 <= SEATS <= 2 (Pod Debem ma 2 konie - regula sumy) i SEATS < ATTEMPTS" >&2
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Klient psql (host albo kontener lokalnego stacku) - wspolna detekcja w _psql.sh.
# shellcheck source=_psql.sh
source "$SCRIPT_DIR/_psql.sh" || exit 1

STABLE_ID="$(q "select id from public.stables where name = 'Stadnina Pod Debem'")"
DAY_ID="$(q "select id from public.schedule_days where stable_id = ${STABLE_ID:-0} and day = current_date + 1")"
DAY_DATE="$(q "select day from public.schedule_days where id = ${DAY_ID:-0}")"
INSTRUCTOR_ID="$(q "select id from public.instructors where stable_id = ${STABLE_ID:-0} and name = 'Joanna Wrona'")"
ANNA_ID="$(q "select id from public.profiles where full_name = 'Anna Kowalska'")"
HOUR=12
ORIGINAL_SEATS="$(q "select seats from public.schedule_slots where schedule_day_id = ${DAY_ID:-0} and instructor_id = ${INSTRUCTOR_ID:-0} and hour = $HOUR")"

if [ -z "$STABLE_ID" ] || [ -z "$DAY_ID" ] || [ -z "$INSTRUCTOR_ID" ] || [ -z "$ANNA_ID" ] || [ -z "$ORIGINAL_SEATS" ]; then
  echo "BLAD: brak danych demo. Uruchom 'npx supabase db reset'." >&2
  exit 1
fi

rider_id() { printf 'e2e0c0de-0000-4000-8000-%012d' "$1"; }

# Polecenie w kontekscie jezdzca: SET ROLE + claims + wlasciwe SQL w jednym `-c`, czyli
# w jednej transakcji implicit - tak RLS widzi je jak zapytanie z aplikacji.
as_rider_sql() {
  local rider="$1" sql="$2"
  printf "set role authenticated; set request.jwt.claims = '{\"sub\":\"%s\",\"role\":\"authenticated\"}'; %s" "$rider" "$sql"
}

insert_sql() {
  printf "insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id) values (%s, %s, %s, '%s');" \
    "$DAY_ID" "$INSTRUCTOR_ID" "$HOUR" "$1"
}

active_count() {
  q "select count(*) from public.bookings where schedule_day_id = $DAY_ID and instructor_id = $INSTRUCTOR_ID and hour = $HOUR and status = 'active'"
}

cleanup() {
  psql_run -q -c "delete from auth.users where id::text like 'e2e0c0de-0000-4000-8000-%'" >/dev/null
  psql_run -q -c "update public.schedule_slots set seats = $ORIGINAL_SEATS where schedule_day_id = $DAY_ID and instructor_id = $INSTRUCTOR_ID and hour = $HOUR" >/dev/null
}
cleanup

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; cleanup' EXIT

# Tymczasowi jezdzcy i limit slotu. Seed pisze jako postgres z pominieciem save_schedule_day,
# tu tak samo - regula sumy (2 konie) zostaje zachowana dla SEATS <= 2.
users_sql="insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) values "
for i in $(seq 1 "$ATTEMPTS"); do
  [ "$i" -gt 1 ] && users_sql+=", "
  users_sql+="('00000000-0000-0000-0000-000000000000', '$(rider_id "$i")', 'authenticated', 'authenticated', 'rownolegly-$i@example.com', '{\"role\":\"rider\",\"full_name\":\"Rownolegly $i\"}', now(), now())"
done
psql_run -v ON_ERROR_STOP=1 -q -c "$users_sql;" >/dev/null || { echo "BLAD: nie udalo sie zalozyc tymczasowych jezdzcow" >&2; exit 1; }
psql_run -v ON_ERROR_STOP=1 -q -c "update public.schedule_slots set seats = $SEATS where schedule_day_id = $DAY_ID and instructor_id = $INSTRUCTOR_ID and hour = $HOUR" >/dev/null

echo "Slot testowy: dzien=$DAY_ID ($DAY_DATE) instruktor=$INSTRUCTOR_ID (Joanna Wrona) godzina=$HOUR, limit=$SEATS, prob=$ATTEMPTS (kazda od innego jezdzca)"

pids=()
for i in $(seq 1 "$ATTEMPTS"); do
  rider="$(rider_id "$i")"
  psql_run -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -q -c \
    "$(as_rider_sql "$rider" "select pg_sleep($BARRIER_SECONDS); $(insert_sql "$rider") select pg_sleep($HOLD_SECONDS);")" \
    >"$TMP/out_$i" 2>"$TMP/err_$i" &
  pids+=("$!")
done

successes=0
failures=0
loser=""
for idx in "${!pids[@]}"; do
  if wait "${pids[$idx]}"; then
    successes=$((successes + 1))
  else
    failures=$((failures + 1))
    loser="$((idx + 1))"
  fi
done

active="$(active_count)"

# Kazda odmowa musi byc SB009 - inny kod oznacza, ze test mierzy cos innego niz limit.
wrong_error=0
for f in "$TMP"/err_*; do
  [ -s "$f" ] || continue
  if ! grep -q "SB009" "$f"; then
    wrong_error=$((wrong_error + 1))
  fi
done

echo "Sukcesy: $successes | Odmowy: $failures | Aktywne zapisy na slocie: $active"

status=0
if [ "$successes" -ne "$SEATS" ]; then
  echo "FAIL: oczekiwano dokladnie $SEATS sukcesow, bylo $successes" >&2
  status=1
fi
if [ "$active" -ne "$SEATS" ]; then
  echo "FAIL: oczekiwano dokladnie $SEATS aktywnych zapisow, jest $active" >&2
  status=1
fi
if [ "$wrong_error" -gt 0 ]; then
  echo "FAIL: $wrong_error odmow z innego powodu niz SB009:" >&2
  cat "$TMP"/err_* >&2
  status=1
fi

# --- Zwolnienie miejsca: odwolanie jednego zwyciezcy wpuszcza przegranego. ---
if [ "$status" -eq 0 ]; then
  winner="$(q "select rider_id from public.bookings where schedule_day_id = $DAY_ID and instructor_id = $INSTRUCTOR_ID and hour = $HOUR and status = 'active' order by id limit 1")"
  psql_run -v ON_ERROR_STOP=1 -q -c "$(as_rider_sql "$winner" "update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'rider' where rider_id = '$winner' and schedule_day_id = $DAY_ID and status = 'active';")" >/dev/null

  if psql_run -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -q -c "$(as_rider_sql "$(rider_id "$loser")" "$(insert_sql "$(rider_id "$loser")")")" >/dev/null 2>"$TMP/err_release"; then
    echo "Zwolnienie miejsca: po odwolaniu zwyciezcy zapis przegranego przeszedl"
  else
    echo "FAIL: po odwolaniu zwyciezcy zapis przegranego odrzucony:" >&2
    cat "$TMP/err_release" >&2
    status=1
  fi

  active_after="$(active_count)"
  if [ "$active_after" -ne "$SEATS" ]; then
    echo "FAIL: po zwolnieniu i ponownym zapisie oczekiwano $SEATS aktywnych, jest $active_after" >&2
    status=1
  fi

  # Zajetosc widziana przez innego jezdzca: sama liczba miejsc dla (Joanna, 12).
  taken="$(psql_run -tAq -c "$(as_rider_sql "$ANNA_ID" "select taken from public.get_slot_occupancy($STABLE_ID, date '$DAY_DATE') where instructor_id = $INSTRUCTOR_ID and hour = $HOUR;")" | tr -d '\r\n')"
  if [ "$taken" != "$SEATS" ]; then
    echo "FAIL: get_slot_occupancy jako jezdziec pokazuje '$taken' zajetych miejsc (Joanna, $HOUR) zamiast $SEATS" >&2
    status=1
  else
    echo "Zajetosc: get_slot_occupancy jako Anna pokazuje $SEATS zajete miejsca (Joanna, $HOUR)"
  fi
fi

if [ "$status" -eq 0 ]; then
  echo "PASS: dokladnie $SEATS z $ATTEMPTS rownoleglych zapisow przeszlo, pozostale odrzucone przez SB009; odwolanie zwolnilo miejsce"
fi
exit "$status"
