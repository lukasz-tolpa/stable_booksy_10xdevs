-- Migracja: tozsamosc i stadnina (F-01, faza 1)
--
-- Zakres:
--   * schemat `private` z funkcjami pomocniczymi dla polityk RLS
--   * public.profiles  - profil uzytkownika z rola Osrodek/Jezdziec, spiety z auth.users
--   * public.stables   - stadnina, jedna na konto o roli 'stable'
--   * public.horses    - konie nalezace do stadniny
--   * trigger tworzacy profil po rejestracji + trigger blokujacy zmiane roli
--   * RLS na wszystkich trzech tabelach (polityki per operacja, wylacznie dla roli authenticated)
--
-- Guardrail PRD (sekcja Access Control): konto osrodka modyfikuje wylacznie dane wlasnej stadniny.
-- Wszystkie predykaty polityk owijaja auth.uid() i funkcje pomocnicze w (select ...), zeby
-- Postgres wywolal je raz na zapytanie, a nie raz na wiersz.

-- ---------------------------------------------------------------------------
-- Schemat pomocniczy
-- ---------------------------------------------------------------------------

create schema if not exists private;

comment on schema private is
  'Funkcje pomocnicze dla polityk RLS. Schemat celowo poza api.schemas w config.toml, wiec nie jest wystawiony przez PostgREST.';

-- ---------------------------------------------------------------------------
-- public.profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null,
  full_name text,
  created_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('stable', 'rider'))
);

comment on table public.profiles is
  'Profil uzytkownika. PK jest jednoczesnie kluczem obcym do auth.users - wiersz powstaje triggerem po rejestracji.';
comment on column public.profiles.role is
  'Rola konta: stable = Osrodek (administruje wlasna stadnina), rider = Jezdziec (zapisuje sie na jazdy).';

alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------------
-- public.stables
-- ---------------------------------------------------------------------------

create table public.stables (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  city text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint stables_owner_id_key unique (owner_id),
  constraint stables_name_not_blank check (length(btrim(name)) > 0),
  constraint stables_city_not_blank check (length(btrim(city)) > 0)
);

comment on table public.stables is
  'Stadnina. Ograniczenie unique(owner_id) koduje zalozenie: jedno konto o roli stable = jedna stadnina.';
comment on column public.stables.city is
  'Miejscowosc - pole, po ktorym filtruje katalog osrodkow (FR-006).';

alter table public.stables enable row level security;

-- ---------------------------------------------------------------------------
-- public.horses
-- ---------------------------------------------------------------------------

create table public.horses (
  id bigint generated always as identity primary key,
  stable_id bigint not null references public.stables (id) on delete cascade,
  name text not null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint horses_id_stable_id_key unique (id, stable_id),
  constraint horses_name_not_blank check (length(btrim(name)) > 0)
);

comment on table public.horses is
  'Kon nalezacy do stadniny.';
comment on constraint horses_id_stable_id_key on public.horses is
  'Pozornie zbedny klucz unikalny - jest celem zlozonego klucza obcego z schedule_day_horses (faza 2), ktory wymusza, ze kon i dzien grafiku naleza do tej samej stadniny.';

create index horses_stable_id_idx on public.horses (stable_id);

alter table public.horses enable row level security;

-- ---------------------------------------------------------------------------
-- Funkcje pomocnicze dla RLS
-- ---------------------------------------------------------------------------

create or replace function private.current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid());
$$;

comment on function private.current_role() is
  'Rola zalogowanego uzytkownika. SECURITY DEFINER, bo omija RLS na profiles - filtr po auth.uid() jest wewnatrz ciala funkcji.';

create or replace function private.current_stable_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.stables s
  where s.owner_id = (select auth.uid());
$$;

comment on function private.current_stable_id() is
  'Id stadniny nalezacej do zalogowanego uzytkownika, albo NULL. Fundament guardraila izolacji danych osrodka.';

-- Domyslnie Postgres nadaje EXECUTE roli PUBLIC - odbieramy i nadajemy wylacznie roli authenticated.
-- Rola authenticated musi miec EXECUTE, bo wyrazenia polityk RLS wykonuja sie z uprawnieniami
-- uzytkownika pytajacego, nie wlasciciela tabeli.
revoke execute on function private.current_role() from public, anon;
revoke execute on function private.current_stable_id() from public, anon;

grant usage on schema private to authenticated;
grant execute on function private.current_role() to authenticated;
grant execute on function private.current_stable_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger: profil powstaje razem z uzytkownikiem
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    -- Twarde mapowanie zamiast przepisania wartosci z metadanych: nieznana rola nie moze
    -- wywalic rejestracji na constraincie. Dopoki S-01 nie przekazuje roli w options.data,
    -- kazde nowe konto jest jezdzcem.
    case new.raw_user_meta_data ->> 'role'
      when 'stable' then 'stable'
      else 'rider'
    end,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Tworzy profil po rejestracji. SECURITY DEFINER + pusty search_path sa wymagane - funkcja wykonuje sie w kontekscie wewnetrznego zapisu Supabase Auth.';

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Trigger: rola konta jest niezmienna z poziomu sesji uzytkownika
-- ---------------------------------------------------------------------------

create or replace function public.enforce_profile_role_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Warunek na auth.uid() zostawia furtke obsludze technicznej (psql, service_role),
  -- a zamyka ja uzytkownikowi z sesja - jezdziec nie awansuje sie sam na osrodek.
  if (select auth.uid()) is not null and new.role is distinct from old.role then
    raise exception 'Roli konta nie mozna zmienic' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_role_immutable
before update on public.profiles
for each row execute function public.enforce_profile_role_immutable();

-- ---------------------------------------------------------------------------
-- Polityki RLS: profiles
-- ---------------------------------------------------------------------------

-- Wersja minimalna. Faza 2 zastapi ja wariantem dopuszczajacym odczyt profilu jezdzca,
-- ktory ma zapis w mojej stadninie (wymagane przez FR-005).
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Brak polityk INSERT i DELETE: wiersze powstaja i znikaja wylacznie razem z auth.users.

-- ---------------------------------------------------------------------------
-- Polityki RLS: stables
-- ---------------------------------------------------------------------------

-- Katalog osrodkow jest widoczny dla kazdego zalogowanego (FR-006).
create policy stables_select_authenticated
  on public.stables
  for select
  to authenticated
  using (true);

create policy stables_insert_own
  on public.stables
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select private.current_role()) = 'stable'
  );

create policy stables_update_own
  on public.stables
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy stables_delete_own
  on public.stables
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Polityki RLS: horses
-- ---------------------------------------------------------------------------

-- Jezdziec musi widziec imie konia w slocie, wiec odczyt jest otwarty dla zalogowanych.
create policy horses_select_authenticated
  on public.horses
  for select
  to authenticated
  using (true);

create policy horses_insert_own_stable
  on public.horses
  for insert
  to authenticated
  with check (stable_id = (select private.current_stable_id()));

create policy horses_update_own_stable
  on public.horses
  for update
  to authenticated
  using (stable_id = (select private.current_stable_id()))
  with check (stable_id = (select private.current_stable_id()));

create policy horses_delete_own_stable
  on public.horses
  for delete
  to authenticated
  using (stable_id = (select private.current_stable_id()));
