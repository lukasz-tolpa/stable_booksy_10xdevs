-- Uprawnienie do ukladania grafiku: wlasciciel nadaje je i odbiera (#78, spec #77, ADR-0004,
-- GLOSSARY "Uprawnienie do układania grafiku", "Instruktor").
--
-- Ta migracja wprowadza sam znacznik i jego zarzadzanie. Korzystanie z uprawnienia (zapis
-- grafiku dnia przez instruktora, odczyt formularza) to #79 - zbuduje na `arranges_schedule`.
--
--   * `instructors.arranges_schedule` - domyslnie false. Aplikacja ani go nie zapisuje, ani nie
--     czyta wprost (tak jak `account_id`: SELECT i UPDATE nadane sa na liscie kolumn bez niego).
--     Wlasciciel widzi go w public.list_instructor_accounts(), instruktor swoj w
--     public.my_instructor().
--   * Niezmiennik (CHECK, takze dla postgres): uprawnienie ma tylko aktywny instruktor z kontem.
--     Wyzwalacz `instructors_lost_standing_drops_schedule_permission` zeruje znacznik w tej samej
--     transakcji, gdy instruktor traci aktywnosc albo konto - dezaktywacja (tak jak
--     wycofanie zaproszenia w 20261120090000) i usuniecie profilu (FK on delete set null).
--     Ponowna aktywacja znacznika nie przywraca.
--   * public.set_schedule_permission(instructor, granted) - jedyna droga zapisu; odmowy:
--     42501 wywolujacy nie jest wlascicielem osrodka, SB013 instruktor spoza osrodka wlasciciela
--     (albo nieistniejacy), SB023 bez konta, SB024 nieaktywny, SB025 sam wlasciciel.
--
-- Dowod: supabase/tests/schedule_permission.sql.

alter table public.instructors
  add column arranges_schedule boolean not null default false;

comment on column public.instructors.arranges_schedule is
  'Uprawnienie do ukladania grafiku (GLOSSARY). Zapis wylacznie przez public.set_schedule_permission; anon i authenticated nie czytaja kolumny wprost - wlasciciel widzi ja w list_instructor_accounts(), instruktor w my_instructor().';

alter table public.instructors
  add constraint instructors_schedule_permission_standing_check
  check (not arranges_schedule or (active and account_id is not null));

-- Kolumna nie trafia do list kolumn z 20261112090000 (UPDATE: active) i 20261120090000
-- (SELECT: id, stable_id, name, active, created_at), wiec authenticated jej nie zapisze i nie
-- odczyta. Jawnie, na wypadek przyszlego nadania na cala tabele:
revoke update (arranges_schedule) on public.instructors from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Utrata aktywnosci albo konta zeruje znacznik
-- ---------------------------------------------------------------------------

create or replace function private.drop_schedule_permission_on_lost_standing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.arranges_schedule := false;
  return new;
end;
$$;

comment on function private.drop_schedule_permission_on_lost_standing() is
  'Dezaktywacja albo utrata konta odbiera instruktorowi uprawnienie do ukladania grafiku; ponowna aktywacja go nie przywraca (spec #77).';

revoke execute on function private.drop_schedule_permission_on_lost_standing() from public, anon, authenticated;

-- BEFORE, zeby CHECK widzial juz wyzerowany znacznik. Tylko przejscia - bezposrednie ustawienie
-- znacznika instruktorowi bez konta albo nieaktywnemu odrzuca CHECK, nie wyzwalacz po cichu.
create trigger instructors_lost_standing_drops_schedule_permission
before update on public.instructors
for each row
when (
  old.arranges_schedule
  and ((old.active and not new.active) or (old.account_id is not null and new.account_id is null))
)
execute function private.drop_schedule_permission_on_lost_standing();

-- ---------------------------------------------------------------------------
-- Nadanie i odebranie
-- ---------------------------------------------------------------------------

create or replace function public.set_schedule_permission(p_instructor_id bigint, p_granted boolean)
returns void
language plpgsql
-- SECURITY DEFINER celowo: authenticated nie ma zapisu do kolumny arranges_schedule. Osrodek
-- bierze z sesji (private.owned_stable_id), nigdy z argumentu.
security definer
set search_path = ''
as $$
declare
  v_stable bigint := private.owned_stable_id();
  v_instructor public.instructors;
begin
  if v_stable is null then
    raise exception 'Uprawnienie do ukladania grafiku nadaje wylacznie wlasciciel osrodka' using errcode = '42501';
  end if;

  -- Blokada wiersza serializuje nadanie z rownoczesna dezaktywacja tego instruktora.
  select * into v_instructor
  from public.instructors i
  where i.id = p_instructor_id and i.stable_id = v_stable
  for update;

  if v_instructor.id is null then
    raise exception 'Instruktor spoza osrodka' using errcode = 'SB013';
  end if;
  if v_instructor.account_id = (select auth.uid()) then
    raise exception 'Wlasciciel ma wszystkie uprawnienia' using errcode = 'SB025';
  end if;
  if not v_instructor.active then
    raise exception 'Instruktor nieaktywny' using errcode = 'SB024';
  end if;
  if v_instructor.account_id is null then
    raise exception 'Instruktor bez konta' using errcode = 'SB023';
  end if;

  update public.instructors
     set arranges_schedule = p_granted
   where id = v_instructor.id;
end;
$$;

comment on function public.set_schedule_permission(bigint, boolean) is
  'Wlasciciel nadaje (true) albo odbiera (false) instruktorowi swojego osrodka uprawnienie do ukladania grafiku. Kody: 42501 nie-wlasciciel, SB013 instruktor spoza osrodka, SB023 bez konta, SB024 nieaktywny, SB025 sam wlasciciel.';

revoke execute on function public.set_schedule_permission(bigint, boolean) from public, anon;
grant execute on function public.set_schedule_permission(bigint, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Odczyt: lista wlasciciela i wlasny instruktor
-- ---------------------------------------------------------------------------

-- Zmiana typu wyniku wymaga DROP; tresc jak w 20261120090000 plus znacznik.
drop function public.list_instructor_accounts();

create function public.list_instructor_accounts()
returns table (instructor_id bigint, owner boolean, arranges_schedule boolean)
language plpgsql
stable
-- SECURITY DEFINER celowo: kolumny account_id i arranges_schedule sa zamkniete dla authenticated.
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
  select i.id, i.account_id = (select auth.uid()), i.arranges_schedule
  from public.instructors i
  where i.stable_id = v_stable
    and i.account_id is not null
  order by i.id;
end;
$$;

comment on function public.list_instructor_accounts() is
  'Instruktorzy osrodka wlasciciela, ktorzy maja konto; owner - konto samego wlasciciela, arranges_schedule - uprawnienie do ukladania grafiku. Bez UUID kont. Kod: 42501 dla nie-wlasciciela.';

revoke execute on function public.list_instructor_accounts() from public, anon;
grant execute on function public.list_instructor_accounts() to authenticated;

drop function public.my_instructor();

create function public.my_instructor()
returns table (id bigint, name text, active boolean, stable_name text, stable_owner_id uuid, arranges_schedule boolean)
language sql
stable
-- SECURITY DEFINER celowo: kolumny account_id i arranges_schedule sa zamkniete dla authenticated.
security definer
set search_path = ''
as $$
  -- Osrodek tylko dla aktywnego: zdezaktywowanemu RLS odcina caly osrodek (#73). Znacznik
  -- nieaktywnego jest zawsze false (CHECK instructors_schedule_permission_standing_check).
  select
    i.id,
    i.name,
    i.active,
    case when i.active then s.name end,
    case when i.active then s.owner_id end,
    i.arranges_schedule
  from public.instructors i
  join public.stables s on s.id = i.stable_id
  where i.account_id = (select auth.uid());
$$;

comment on function public.my_instructor() is
  'Instruktor powiazany z zalogowanym kontem (zero albo jeden wiersz), takze nieaktywny; nazwa i wlasciciel osrodka tylko dla aktywnego; arranges_schedule - uprawnienie do ukladania grafiku.';

revoke execute on function public.my_instructor() from public, anon;
grant execute on function public.my_instructor() to authenticated;
