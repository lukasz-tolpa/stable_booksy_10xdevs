-- Przydzial konia przez osrodek (#42, ADR-0002, GLOSSARY "Przydzial konia").
--
-- Osrodek przydziela, zmienia i cofa konia zapisu zwyklym UPDATE-em `bookings.horse_id` pod RLS
-- (polityka bookings_update_own_or_my_stable - wylacznie zapisy wlasnej stadniny). Przydzial nie
-- ma progu czasu: dziala takze po terminie jazdy (uzupelnienie statystyk).
--
-- Gwarancje juz istniejace (migracja 20261114090000), na ktorych opiera sie przydzial:
--   23503  kon nie pracuje tego dnia          - bookings_assigned_horse_fkey
--   23505  kon ma juz aktywny zapis w godzinie - bookings_horse_hour_key
--   23514  przydzial do zapisu odwolanego      - bookings_horse_only_when_active_check
-- Nowa gwarancja:
--   42501  przydzial zmienia ktos inny niz osrodek (jezdziec) - wyzwalacz bookings_horse_assignment
--
-- Odwolanie przez osrodek nie wymaga zmian w bazie: UPDATE statusu z cancelled_by = 'stable'
-- przechodzi przez wyzwalacz bookings_cancellation (odwolujacy = rola wolajacego, kon czyszczony).
-- Prog "godzina juz sie zaczela" zostaje w aplikacji, jak przy odwolaniu przez jezdzca.
-- Dowod: supabase/tests/stable_booking_actions.sql.

create or replace function public.enforce_booking_horse_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- NULL dla postgres (migracje, dane demo, testy) - wtedy przydzial jest dozwolony.
  v_role text := private.current_role();
begin
  -- Odwolanie czysci konia samo (bookings_cancellation odpala wczesniej - kolejnosc alfabetyczna),
  -- wiec jezdziec odwolujacy zapis z jawnym horse_id = null nie jest tu odrzucany.
  if new.horse_id is distinct from old.horse_id
     and new.status = 'active'
     and v_role is not null
     and v_role <> 'stable' then
    raise exception 'Konia do zapisu przydziela wylacznie osrodek' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_booking_horse_assignment() is
  'Przydzial konia (#42): horse_id zapisu aktywnego zmienia wylacznie osrodek (42501 dla jezdzca). Kon z dnia i jeden zapis konia w godzinie pilnuja FK bookings_assigned_horse_fkey i indeks bookings_horse_hour_key.';

revoke execute on function public.enforce_booking_horse_assignment() from public, anon, authenticated;

create trigger bookings_horse_assignment
before update of horse_id on public.bookings
for each row execute function public.enforce_booking_horse_assignment();

-- Kolumna przydzialu dla zalogowanych; kto moze ja zmieniac, rozstrzyga wyzwalacz powyzej,
-- a ktore zapisy - polityka UPDATE (wlasna stadnina albo wlasny zapis jezdzca).
grant update (horse_id) on public.bookings to authenticated;
