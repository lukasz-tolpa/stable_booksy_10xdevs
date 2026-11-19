-- Poprawki po przegladzie spec #70 (ADR-0004, GLOSSARY "Instruktor").
--
-- 1. Dezaktywacja instruktora wycofuje jego zywe zaproszenie w tej samej transakcji. Lista
--    zaproszen pomija instruktorow nieaktywnych, wiec wlasciciel nie mial jak wycofac takiego
--    linku, a ponowna aktywacja w ciagu 7 dni go ozywiala. Teraz link po dezaktywacji jest
--    wycofany na stale (invitation_by_token: 'revoked', przyjecie: SB018) - po aktywacji
--    instruktora wlasciciel wystawia nowe zaproszenie.
--
-- 2. `instructors.account_id` nie jest czytelny z aplikacji. Katalog (nazwa instruktora przy
--    slocie) jest otwarty dla jezdzca i kazdego wlasciciela, a kolumna zdradzala, ktory
--    instruktor ma konto, i UUID jego profilu. SELECT na tabeli zostaje na kolumnach bez
--    `account_id`; aplikacja dostaje tylko to, czego potrzebuje:
--      * public.my_instructor() - instruktor powiazany z kontem (middleware, „Moje sloty”),
--      * public.list_instructor_accounts() - ktory instruktor osrodka wlasciciela ma konto
--        i ktory jest wlascicielem (kolumna stanu konta na stronie Instruktorzy).
--    Polityki RLS czytaja kolumne dalej (wyrazenia polityk nie wymagaja uprawnien do kolumn),
--    funkcje security definer - takze.
--
-- Dowod: supabase/tests/instructor_invitations.sql, instructor_invitation_acceptance.sql,
-- instructor_account_access.sql.

-- ---------------------------------------------------------------------------
-- 1. Dezaktywacja wycofuje zaproszenie
-- ---------------------------------------------------------------------------

create or replace function private.revoke_invitation_on_deactivation()
returns trigger
language plpgsql
-- SECURITY DEFINER celowo: dezaktywuje wlasciciel przez RLS, a tabela zaproszen jest zamknieta
-- dla authenticated.
security definer
set search_path = ''
as $$
begin
  update public.instructor_invitations
     set revoked_at = now()
   where instructor_id = new.id
     and accepted_at is null
     and revoked_at is null;
  return null;
end;
$$;

comment on function private.revoke_invitation_on_deactivation() is
  'Dezaktywacja instruktora wycofuje jego otwarte zaproszenie - ponowna aktywacja nie ozywia starego linku (spec #70).';

revoke execute on function private.revoke_invitation_on_deactivation() from public, anon, authenticated;

create trigger instructors_deactivation_revokes_invitation
after update of active on public.instructors
for each row
when (old.active and not new.active)
execute function private.revoke_invitation_on_deactivation();

-- Zaproszenia instruktorow zdezaktywowanych przed ta migracja.
update public.instructor_invitations inv
   set revoked_at = now()
  from public.instructors i
 where i.id = inv.instructor_id
   and not i.active
   and inv.accepted_at is null
   and inv.revoked_at is null;

-- ---------------------------------------------------------------------------
-- 2. account_id poza odczytem aplikacji
-- ---------------------------------------------------------------------------

revoke select on public.instructors from anon, authenticated;
grant select (id, stable_id, name, active, created_at) on public.instructors to anon, authenticated;

comment on column public.instructors.account_id is
  'Konto instruktora (opcjonalne, unikalne). Ustawiane wylacznie przez funkcje security definer (zalozenie osrodka, przyjecie zaproszenia); anon i authenticated nie czytaja kolumny - aplikacja uzywa public.my_instructor() i public.list_instructor_accounts().';

create or replace function public.my_instructor()
returns table (id bigint, name text, active boolean, stable_name text, stable_owner_id uuid)
language sql
stable
-- SECURITY DEFINER celowo: kolumna account_id jest zamknieta dla authenticated.
security definer
set search_path = ''
as $$
  -- Osrodek tylko dla aktywnego: zdezaktywowanemu RLS odcina caly osrodek (#73).
  select
    i.id,
    i.name,
    i.active,
    case when i.active then s.name end,
    case when i.active then s.owner_id end
  from public.instructors i
  join public.stables s on s.id = i.stable_id
  where i.account_id = (select auth.uid());
$$;

comment on function public.my_instructor() is
  'Instruktor powiazany z zalogowanym kontem (zero albo jeden wiersz), takze nieaktywny; nazwa i wlasciciel osrodka tylko dla aktywnego.';

revoke execute on function public.my_instructor() from public, anon;
grant execute on function public.my_instructor() to authenticated;

create or replace function public.list_instructor_accounts()
returns table (instructor_id bigint, owner boolean)
language plpgsql
stable
-- SECURITY DEFINER celowo: kolumna account_id jest zamknieta dla authenticated.
security definer
set search_path = ''
as $$
declare
  v_stable bigint := private.owned_stable_id();
begin
  if v_stable is null then
    raise exception 'Konta instruktorow widzi wylacznie wlasciciel osrodka' using errcode = '42501';
  end if;

  return query
  select i.id, i.account_id = (select auth.uid())
  from public.instructors i
  where i.stable_id = v_stable
    and i.account_id is not null
  order by i.id;
end;
$$;

comment on function public.list_instructor_accounts() is
  'Instruktorzy osrodka wlasciciela, ktorzy maja konto; owner - konto samego wlasciciela. Bez UUID kont. Kod: 42501 dla nie-wlasciciela.';

revoke execute on function public.list_instructor_accounts() from public, anon;
grant execute on function public.list_instructor_accounts() to authenticated;
