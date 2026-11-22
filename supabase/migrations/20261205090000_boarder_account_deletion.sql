-- Usuniecie konta pensjonariusza konczy pobyty jego koni (#120, spec #112, ADR 0001, ADR 0005,
-- GLOSSARY „Pobyt”: „Usunięcie konta pensjonariusza kończy pobyty jego koni we wszystkich ośrodkach”).
--
-- Usuniecia konta nigdy sie nie odmawia - zadne powiazanie konia, pobytu ani zapisu z kontem tego nie
-- blokuje (horse_owners.rider_id ON DELETE SET NULL, #114; zapisy - ADR 0001, wyzwalacz
-- profiles_release_future_bookings; stawki i koszty dodatkowe - kaskada).
--
-- Wyzwalacz BEFORE DELETE na profiles (zanim klucz obcy odepnie wlasciciela konia), we wszystkich
-- osrodkach:
--   * trwajacy pobyt (przyjazd najpozniej dzis, Europe/Warsaw) konczy sie dzis; dzien wyjazdu wpisuje
--     „usuniecie konta”: departure_set_by = 'account_deleted' (nowa wartosc),
--   * pobyt, ktory jeszcze sie nie zaczal (przyjazd po dzis), znika - kon nie przyjechal,
--   * zakonczone pobyty zostaja bez zmian; konie zostaja w osrodku bez wlasciciela.
-- Bez regul set_stay_departure (SB043-SB045): koniec pobytu przy usunieciu konta nie jest odmawiany.
--
-- Dowod: supabase/tests/boarder_account_deletion.sql.

alter table public.horse_stays
  drop constraint horse_stays_departure_set_by_check,
  add constraint horse_stays_departure_set_by_check
    check (departure_set_by in ('stable', 'rider', 'account_deleted'));

comment on column public.horse_stays.departure_set_by is
  'Kto ostatnio ustawil dzien wyjazdu: stable = osrodek, rider = pensjonariusz, account_deleted = usuniecie konta pensjonariusza (#120). NULL - pobyt trwa.';

create function public.end_horse_stays_of_deleted_profile()
returns trigger
language plpgsql
-- SECURITY DEFINER celowo: pobyty sa zamkniete dla zapisu, a regula ma zadzialac niezaleznie od tego,
-- kto i jaka sciezka usuwa konto.
security definer
set search_path = ''
as $$
declare
  v_today date := private.warsaw_today();
begin
  delete from public.horse_stays s
  using public.horse_owners o
  where o.horse_id = s.horse_id
    and o.rider_id = old.id
    and s.arrival_day > v_today;

  update public.horse_stays s
     set departure_day = v_today,
         departure_set_by = 'account_deleted',
         departure_set_at = now()
    from public.horse_owners o
   where o.horse_id = s.horse_id
     and o.rider_id = old.id
     and s.departure_day is null;

  -- Wlasciciela konia odpina klucz obcy horse_owners.rider_id (ON DELETE SET NULL).
  return old;
end;
$$;

comment on function public.end_horse_stays_of_deleted_profile() is
  '#120: przy usunieciu konta pensjonariusza konczy dzis (Europe/Warsaw) trwajace pobyty jego koni we wszystkich osrodkach (departure_set_by = account_deleted) i usuwa pobyty, ktore jeszcze sie nie zaczely. Konie zostaja bez wlasciciela przez klucz obcy horse_owners.rider_id.';

revoke execute on function public.end_horse_stays_of_deleted_profile() from public, anon, authenticated;

create trigger profiles_end_horse_stays
before delete on public.profiles
for each row execute function public.end_horse_stays_of_deleted_profile();
