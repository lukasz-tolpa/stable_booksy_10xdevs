-- Konie pensjonatowe i pobyt (#114, spec #112, ADR 0005, GLOSSARY „Koń ośrodka”, „Koń pensjonatowy”,
-- „Pobyt”, „Pensjonariusz”).
--
-- Zakres:
--   * public.horses.kind: 'stable' (koń ośrodka) albo 'boarding' (koń pensjonatowy); istniejące konie
--     to konie ośrodka. Rodzaj nie zmienia się (wyzwalacz horses_kind_immutable, takze dla postgres).
--     Wlasciciel dodaje wprost tylko konia osrodka (polityka horses_insert_own_stable); konia
--     pensjonatowego - wylacznie przez public.add_boarding_horse.
--   * Wlasciciel konia pensjonatowego i jego pobyty sa POZA katalogiem koni (ten czyta kazdy jezdziec,
--     private.reads_catalogue): public.horse_owners (kon -> pensjonariusz) i public.horse_stays (pobyty).
--     Czytaja je tylko wlasciciel osrodka i sam pensjonariusz; zapis wylacznie przez funkcje ponizej
--     (INSERT/UPDATE/DELETE odebrane authenticated).
--   * Usuniecie konta nie jest blokowane przez zadne powiazanie konia z kontem (#120):
--     horse_owners.rider_id -> profiles ON DELETE SET NULL (kon zostaje bez wlasciciela), pobyty wisza na
--     koniu, nie na koncie. Zakonczenie pobytow przy usunieciu konta dopisze #120 (wyzwalacz na profiles).
--   * Pobyty jednego konia nie zachodza na siebie: ograniczenie wykluczajace horse_stays_no_overlap
--     (btree_gist), dzien wyjazdu wlacznie.
--   * Regula „pensjonariusz w miesiacu”: private.stay_overlaps_month / private.is_boarder_in_month -
--     blizniak src/lib/boarding/month.ts (te same przypadki w obu testach).
--   * „Jezdziec mojego osrodka” (private.is_rider_of_my_stable) obejmuje pensjonariusza z pobytem konia
--     w osrodku od dnia przyjazdu - bez zadnego zapisu (profil, stawka indywidualna, koszty dodatkowe).
--   * Kon pensjonatowy nigdy nie jest koniem pracujacym dnia: wyzwalacz na schedule_day_horses (SB046),
--     takze dla postgres (seed, dane demo). save_schedule_day zostaje bez zmian - jego odmowe niesie
--     wyzwalacz, wiec rownolegle zmiany funkcji (#113) sie nie zderzaja.
--
-- Kody odmow (SB030-SB039 zostawione dla #113, ktory powstaje rownolegle):
--   SB040  pod adresem e-mail nie ma konta jezdzca
--   SB041  kon pensjonatowy albo pobyt spoza osrodka / nie twoj (bez wyroczni istnienia)
--   SB042  pobyty konia zachodza na siebie
--   SB043  dzien wyjazdu pozniejszy niz dzis (Europe/Warsaw)
--   SB044  dzien wyjazdu wczesniejszy niz dzien przyjazdu
--   SB045  dzien wyjazdu wczesniejszy niz ostatnia jazda konia w tym pobycie (DETAIL {"day": "RRRR-MM-DD"})
--   SB046  kon pensjonatowy jako kon pracujacy dnia
--   SB047  nowy pobyt konia bez wlasciciela (konto pensjonariusza usuniete)
--
-- Dowod: supabase/tests/boarding_horses.sql.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Rodzaj konia
-- ---------------------------------------------------------------------------

alter table public.horses
  add column kind text not null default 'stable',
  add constraint horses_kind_check check (kind in ('stable', 'boarding'));

comment on column public.horses.kind is
  'Rodzaj konia: stable = kon osrodka (kon pracujacy, przydzielany jezdzcom), boarding = kon pensjonatowy (wlasciciel i pobyty w horse_owners / horse_stays). Niezmienny.';

create function public.enforce_horse_kind_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'Rodzaju konia nie mozna zmienic' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger horses_kind_immutable
before update of kind on public.horses
for each row execute function public.enforce_horse_kind_immutable();

alter policy horses_insert_own_stable on public.horses
  with check (stable_id = (select private.owned_stable_id()) and kind = 'stable');

-- ---------------------------------------------------------------------------
-- 2. Wlasciciel konia pensjonatowego i pobyty
-- ---------------------------------------------------------------------------

create table public.horse_owners (
  horse_id bigint primary key,
  stable_id bigint not null references public.stables (id) on delete cascade,
  rider_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint horse_owners_horse_fkey
    foreign key (horse_id, stable_id) references public.horses (id, stable_id) on delete cascade,
  constraint horse_owners_horse_id_stable_id_key unique (horse_id, stable_id)
);

comment on table public.horse_owners is
  'Wlasciciel (pensjonariusz) konia pensjonatowego - poza katalogiem koni, ktory czyta kazdy jezdziec. rider_id NULL: konto pensjonariusza usuniete, kon zostaje w osrodku bez wlasciciela (#120).';

create index horse_owners_rider_id_idx on public.horse_owners (rider_id);
create index horse_owners_stable_id_idx on public.horse_owners (stable_id);

alter table public.horse_owners enable row level security;

create table public.horse_stays (
  id bigint generated always as identity primary key,
  horse_id bigint not null,
  stable_id bigint not null,
  arrival_day date not null,
  departure_day date,
  departure_set_by text,
  departure_set_at timestamptz,
  created_at timestamptz not null default now(),
  constraint horse_stays_horse_fkey
    foreign key (horse_id, stable_id) references public.horse_owners (horse_id, stable_id) on delete cascade,
  constraint horse_stays_departure_after_arrival check (departure_day is null or departure_day >= arrival_day),
  constraint horse_stays_departure_set_by_check check (departure_set_by in ('stable', 'rider')),
  constraint horse_stays_departure_with_author check ((departure_day is null) = (departure_set_by is null)),
  constraint horse_stays_no_overlap
    exclude using gist (horse_id with =, daterange(arrival_day, departure_day, '[]') with &&)
);

comment on table public.horse_stays is
  'Pobyty konia pensjonatowego w osrodku: dzien przyjazdu, dzien wyjazdu (NULL - trwa) i kto ostatnio go ustawil (stable = osrodek, rider = pensjonariusz). Pobyty jednego konia nie zachodza na siebie.';

create index horse_stays_stable_id_idx on public.horse_stays (stable_id);

alter table public.horse_stays enable row level security;

revoke insert, update, delete, truncate on public.horse_owners from anon, authenticated;
revoke insert, update, delete, truncate on public.horse_stays from anon, authenticated;

create policy horse_owners_select_stable_or_own
  on public.horse_owners
  for select
  to authenticated
  using (
    stable_id = (select private.owned_stable_id())
    or rider_id = (select auth.uid())
  );

create policy horse_stays_select_stable_or_own
  on public.horse_stays
  for select
  to authenticated
  using (
    stable_id = (select private.owned_stable_id())
    or exists (
      select 1
      from public.horse_owners o
      where o.horse_id = horse_stays.horse_id
        and o.rider_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Regula „pensjonariusz w miesiacu” i dzis w strefie osrodka
-- ---------------------------------------------------------------------------

create function private.warsaw_today(p_at timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone 'Europe/Warsaw')::date;
$$;

comment on function private.warsaw_today(timestamptz) is
  'Dzisiejszy dzien kalendarzowy w strefie Europe/Warsaw - granica dnia wyjazdu i „od dnia przyjazdu”.';

create function private.stay_overlaps_month(p_arrival date, p_departure date, p_month date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_arrival < (date_trunc('month', p_month) + interval '1 month')::date
     and (p_departure is null or p_departure >= date_trunc('month', p_month)::date);
$$;

comment on function private.stay_overlaps_month(date, date, date) is
  'Czy pobyt [przyjazd, wyjazd] zachodzi na miesiac dnia p_month - w calosci, takze w miesiacu przyjazdu i wyjazdu. Blizniak stayOverlapsMonth w src/lib/boarding/month.ts.';

create function private.is_boarder_in_month(p_rider_id uuid, p_stable_id bigint, p_month date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.horse_owners o
    join public.horse_stays s on s.horse_id = o.horse_id
    where o.rider_id = p_rider_id
      and o.stable_id = p_stable_id
      and private.stay_overlaps_month(s.arrival_day, s.departure_day, p_month)
  );
$$;

comment on function private.is_boarder_in_month(uuid, bigint, date) is
  'Regula „pensjonariusz w miesiacu” (GLOSSARY „Pensjonariusz”): pobyt choc jednego konia jezdzca w osrodku zachodzi na miesiac dnia p_month. Blizniak isBoarderInMonth w src/lib/boarding/month.ts. SECURITY DEFINER - wolana takze z regul dla jezdzca, ktory nie czyta cudzych pobytow.';

revoke execute on function private.warsaw_today(timestamptz) from public, anon;
revoke execute on function private.stay_overlaps_month(date, date, date) from public, anon;
revoke execute on function private.is_boarder_in_month(uuid, bigint, date) from public, anon;
grant execute on function private.warsaw_today(timestamptz) to authenticated;
grant execute on function private.stay_overlaps_month(date, date, date) to authenticated;
grant execute on function private.is_boarder_in_month(uuid, bigint, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. „Jezdziec mojego osrodka” obejmuje pensjonariusza od dnia przyjazdu konia
-- ---------------------------------------------------------------------------

create or replace function private.is_rider_of_my_stable(p_rider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings b
    join public.schedule_days sd on sd.id = b.schedule_day_id
    where b.rider_id = p_rider_id
      and sd.stable_id = (select private.owned_stable_id())
  ) or exists (
    select 1
    from public.horse_owners o
    join public.horse_stays s on s.horse_id = o.horse_id
    where o.rider_id = p_rider_id
      and o.stable_id = (select private.owned_stable_id())
      and s.arrival_day <= private.warsaw_today()
  );
$$;

comment on function private.is_rider_of_my_stable(uuid) is
  'Jezdziec osrodka wlasciciela: ma w nim zapis (takze odwolany) albo jest pensjonariuszem z pobytem konia od dnia przyjazdu (#114). Polityki profili, stawek i kosztow dodatkowych. SECURITY DEFINER omija zagniezdzone RLS na bookings i pobytach.';

-- ---------------------------------------------------------------------------
-- 5. Wyszukanie jezdzca po adresie e-mail
-- ---------------------------------------------------------------------------

create function private.rider_for_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from auth.users u
  join public.profiles p on p.id = u.id and p.role = 'rider'
  where lower(u.email) = lower(btrim(p_email));
$$;

revoke execute on function private.rider_for_email(text) from public, anon, authenticated;

create function public.find_rider_by_email(p_email text)
returns uuid
language plpgsql
stable
-- SECURITY DEFINER celowo: wlasciciel nie czyta auth.users ani cudzych profili. Zwraca wylacznie
-- identyfikator konta jezdzca - nic wiecej (ani nazwiska, ani czy adres nalezy do instruktora).
security definer
set search_path = ''
as $$
declare
  v_rider uuid;
begin
  if private.owned_stable_id() is null then
    raise exception 'Jezdzca po adresie e-mail wyszukuje wlasciciel osrodka' using errcode = '42501';
  end if;

  v_rider := private.rider_for_email(p_email);
  if v_rider is null then
    raise exception 'Pod tym adresem e-mail nie ma konta jezdzca' using errcode = 'SB040';
  end if;

  return v_rider;
end;
$$;

comment on function public.find_rider_by_email(text) is
  'Konto jezdzca o podanym adresie e-mail (wielkosc liter i spacje na brzegach bez znaczenia) - tylko dla wlasciciela osrodka (42501). Brak konta jezdzca (takze adres instruktora): SB040.';

revoke execute on function public.find_rider_by_email(text) from public, anon;
grant execute on function public.find_rider_by_email(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Dodanie konia pensjonatowego i nowy pobyt
-- ---------------------------------------------------------------------------

create function public.add_boarding_horse(p_name text, p_rider_email text, p_arrival date)
returns bigint
language plpgsql
-- SECURITY DEFINER celowo: tabele wlasciciela i pobytow sa zamkniete dla authenticated; osrodek
-- z sesji (private.owned_stable_id), nigdy z argumentu.
security definer
set search_path = ''
as $$
declare
  v_stable bigint := private.owned_stable_id();
  v_rider uuid;
  v_horse bigint;
begin
  if v_stable is null then
    raise exception 'Konia pensjonatowego dodaje wlasciciel osrodka' using errcode = '42501';
  end if;

  v_rider := public.find_rider_by_email(p_rider_email);

  if p_arrival is null then
    raise exception 'Brak dnia przyjazdu' using errcode = '23502';
  end if;

  insert into public.horses (stable_id, name, kind)
  values (v_stable, btrim(p_name), 'boarding')
  returning id into v_horse;

  insert into public.horse_owners (horse_id, stable_id, rider_id)
  values (v_horse, v_stable, v_rider);

  insert into public.horse_stays (horse_id, stable_id, arrival_day)
  values (v_horse, v_stable, p_arrival);

  return v_horse;
end;
$$;

comment on function public.add_boarding_horse(text, text, date) is
  'Kon pensjonatowy osrodka wlasciciela razem z wlascicielem (konto jezdzca po adresie e-mail, SB040) i pierwszym pobytem od p_arrival - w jednej transakcji. Pusta nazwa: 23514 (horses_name_not_blank).';

revoke execute on function public.add_boarding_horse(text, text, date) from public, anon;
grant execute on function public.add_boarding_horse(text, text, date) to authenticated;

create function public.add_horse_stay(p_horse_id bigint, p_arrival date)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stable bigint := private.owned_stable_id();
  v_owner public.horse_owners;
  v_stay bigint;
begin
  if v_stable is null then
    raise exception 'Nowy pobyt konia dodaje wlasciciel osrodka' using errcode = '42501';
  end if;

  select * into v_owner
  from public.horse_owners
  where horse_id = p_horse_id and stable_id = v_stable
  for update;

  if v_owner.horse_id is null then
    raise exception 'Nie ma takiego konia pensjonatowego w osrodku' using errcode = 'SB041';
  end if;
  if v_owner.rider_id is null then
    raise exception 'Kon nie ma wlasciciela - konto pensjonariusza usunieto' using errcode = 'SB047';
  end if;
  if p_arrival is null then
    raise exception 'Brak dnia przyjazdu' using errcode = '23502';
  end if;

  begin
    insert into public.horse_stays (horse_id, stable_id, arrival_day)
    values (p_horse_id, v_stable, p_arrival)
    returning id into v_stay;
  exception when exclusion_violation then
    raise exception 'Pobyty konia zachodza na siebie' using errcode = 'SB042';
  end;

  return v_stay;
end;
$$;

comment on function public.add_horse_stay(bigint, date) is
  'Nowy pobyt konia pensjonatowego, ktory wrocil do osrodka - tylko wlasciciel osrodka (42501). Cudzy albo nie pensjonatowy kon: SB041; zachodzi na inny pobyt (takze trwajacy): SB042; kon bez wlasciciela: SB047.';

revoke execute on function public.add_horse_stay(bigint, date) from public, anon;
grant execute on function public.add_horse_stay(bigint, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Dzien wyjazdu - ustawia albo poprawia kazda ze stron
-- ---------------------------------------------------------------------------

create function public.set_stay_departure(p_stay_id bigint, p_departure date)
returns bigint
language plpgsql
-- SECURITY DEFINER celowo: pobyty sa zamkniete dla zapisu; strona (osrodek albo pensjonariusz)
-- wynika z sesji i zapisuje sie w departure_set_by.
security definer
set search_path = ''
as $$
declare
  v_stay public.horse_stays;
  v_actor text;
  v_last date;
begin
  select s.* into v_stay
  from public.horse_stays s
  where s.id = p_stay_id
  for update;

  if v_stay.id is not null then
    if v_stay.stable_id = private.owned_stable_id() then
      v_actor := 'stable';
    elsif exists (
      select 1 from public.horse_owners o
      where o.horse_id = v_stay.horse_id and o.rider_id = (select auth.uid())
    ) then
      v_actor := 'rider';
    end if;
  end if;

  if v_actor is null then
    raise exception 'Nie ma takiego pobytu' using errcode = 'SB041';
  end if;
  if p_departure is null then
    raise exception 'Brak dnia wyjazdu' using errcode = '23502';
  end if;
  if p_departure > private.warsaw_today() then
    raise exception 'Dzien wyjazdu % jest pozniejszy niz dzis', p_departure using errcode = 'SB043';
  end if;
  if p_departure < v_stay.arrival_day then
    raise exception 'Dzien wyjazdu % jest wczesniejszy niz dzien przyjazdu %', p_departure, v_stay.arrival_day
      using errcode = 'SB044';
  end if;

  -- Ostatnia jazda (takze przyszly aktywny zapis) konia w tym pobycie po dniu wyjazdu.
  select max(sd.day) into v_last
  from public.bookings b
  join public.schedule_days sd on sd.id = b.schedule_day_id
  where b.horse_id = v_stay.horse_id
    and b.status = 'active'
    and sd.stable_id = v_stay.stable_id
    and sd.day >= v_stay.arrival_day
    and sd.day > p_departure;

  if v_last is not null then
    raise exception 'Dzien wyjazdu % jest wczesniejszy niz ostatnia jazda konia %', p_departure, v_last
      using errcode = 'SB045',
            detail = jsonb_build_object('day', v_last)::text;
  end if;

  begin
    update public.horse_stays
       set departure_day = p_departure,
           departure_set_by = v_actor,
           departure_set_at = now()
     where id = p_stay_id;
  exception when exclusion_violation then
    raise exception 'Pobyty konia zachodza na siebie' using errcode = 'SB042';
  end;

  return p_stay_id;
end;
$$;

comment on function public.set_stay_departure(bigint, date) is
  'Dzien wyjazdu pobytu - ustawia albo poprawia wlasciciel osrodka (departure_set_by = stable) albo pensjonariusz, wlasciciel konia (rider). Nie pozniej niz dzis (SB043), nie wczesniej niz przyjazd (SB044) ani ostatnia jazda konia w pobycie (SB045, DETAIL {"day"}); cudzy pobyt SB041; nachodzi na kolejny pobyt SB042.';

revoke execute on function public.set_stay_departure(bigint, date) from public, anon;
grant execute on function public.set_stay_departure(bigint, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Lista „Pensjonariusze” wlasciciela
-- ---------------------------------------------------------------------------

create function public.get_stable_boarding_horses()
returns table (
  horse_id bigint,
  horse_name text,
  rider_id uuid,
  rider_name text,
  rider_email text,
  stay_id bigint,
  arrival_day date,
  departure_day date,
  departure_set_by text
)
language sql
stable
-- SECURITY DEFINER celowo: nazwisko i adres pensjonariusza, ktorego kon jeszcze nie przyjechal
-- (profil wlasciciel czyta dopiero od dnia przyjazdu), i adres e-mail z auth.users. Tylko konie
-- pensjonatowe osrodka wlasciciela; inne konto dostaje zero wierszy.
security definer
set search_path = ''
as $$
  select h.id, h.name, o.rider_id, p.full_name, u.email::text,
         s.id, s.arrival_day, s.departure_day, s.departure_set_by
  from public.horse_owners o
  join public.horses h on h.id = o.horse_id
  join public.horse_stays s on s.horse_id = o.horse_id
  left join public.profiles p on p.id = o.rider_id
  left join auth.users u on u.id = o.rider_id
  where o.stable_id = private.owned_stable_id()
  order by p.full_name nulls last, o.rider_id, h.name, h.id, s.arrival_day desc;
$$;

comment on function public.get_stable_boarding_horses() is
  'Konie pensjonatowe osrodka wlasciciela z pensjonariuszem (nazwisko, adres e-mail; NULL - konto usuniete) i pobytami, jeden wiersz na pobyt, najnowszy pobyt pierwszy. Inne konta: zero wierszy.';

revoke execute on function public.get_stable_boarding_horses() from public, anon;
grant execute on function public.get_stable_boarding_horses() to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Kon pensjonatowy nie jest koniem pracujacym dnia
-- ---------------------------------------------------------------------------

create function public.enforce_working_horse_is_stable_horse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.horses h where h.id = new.horse_id and h.kind = 'boarding') then
    raise exception 'Kon pensjonatowy nie jest koniem pracujacym dnia' using errcode = 'SB046';
  end if;
  return new;
end;
$$;

comment on function public.enforce_working_horse_is_stable_horse() is
  'Konie pracujace dnia (schedule_day_horses) to wylacznie konie osrodka - odmowa SB046 takze w save_schedule_day i dla postgres (seed, dane demo).';

create trigger schedule_day_horses_stable_horse_only
before insert or update of horse_id on public.schedule_day_horses
for each row execute function public.enforce_working_horse_is_stable_horse();
