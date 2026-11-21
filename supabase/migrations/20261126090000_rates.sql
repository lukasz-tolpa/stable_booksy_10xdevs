-- Stawki (#94, spec #93, GLOSSARY "Stawka").
--
-- Jeden wiersz to jedna zmiana stawki: osrodek, opcjonalny jezdziec, miesiac "od" i kwota w groszach.
--   * rider_id NULL - stawka osrodka; zawsze z kwota,
--   * rider_id ustawiony - stawka indywidualna jezdzca (#97); kwota NULL znaczy "od tego miesiaca
--     wraca stawka osrodka",
--   * from_month - pierwszy dzien miesiaca kalendarzowego (strefa Europe/Warsaw, jak definicja jazdy),
--   * amount - grosze jako liczba calkowita, 0..1 000 000 (0,00-10 000,00 zl), nigdy float.
-- Jedna zmiana na (osrodek, jezdziec-lub-brak, miesiac) - unikalnosc NULLS NOT DISTINCT traktuje brak
-- jezdzca jak wartosc, a zapis na zajety miesiac nadpisuje kwote ("wygrywa ostatnia", upsert).
-- Ktora stawka obowiazuje w miesiacu, liczy aplikacja (src/lib/settlements/rates.ts): najpozniejsza
-- zmiana "od" <= miesiac, a gdy zadnej - pierwsza stawka osrodka (dziala wstecz).
--
-- Reguly czasu (wyzwalacz rates_month_rules), bo odmowa bazy jest gwarancja, nie interfejs:
--   * zapis zmiany tylko z miesiacem "od" rownym biezacemu albo nastepnemu - SB026,
--   * usuniecie tylko zaplanowanej zmiany (miesiac "od" pozniejszy niz biezacy) - SB027;
--     kaskada (usuniecie konta jezdzca albo osrodka) usuwa wszystko,
--   * osrodek, jezdziec i miesiac wiersza sa niezmienne - SB028 (zmiana miesiaca to nowa zmiana).
-- Dostep (RLS): wylacznie wlasciciel, w obrebie private.owned_stable_id(); stawka indywidualna tylko
-- dla jezdzca osrodka (private.is_rider_of_my_stable). Instruktor (takze z uprawnieniem do ukladania
-- grafiku) i jezdziec nie maja zadnej polityki.
-- Usuniecie konta jezdzca usuwa jego stawki indywidualne (FK on delete cascade, ADR-0001).
--
-- Dowod: supabase/tests/settlement_rates.sql.

-- ---------------------------------------------------------------------------
-- Miesiac kalendarzowy w strefie osrodka
-- ---------------------------------------------------------------------------

create function private.warsaw_month_start(p_at timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', p_at at time zone 'Europe/Warsaw')::date;
$$;

comment on function private.warsaw_month_start(timestamptz) is
  'Pierwszy dzien miesiaca kalendarzowego chwili p_at w strefie Europe/Warsaw - "biezacy miesiac" regul czasu rozliczen (stawki #94, koszty dodatkowe #96).';

revoke execute on function private.warsaw_month_start(timestamptz) from public, anon;
grant execute on function private.warsaw_month_start(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Tabela
-- ---------------------------------------------------------------------------

create table public.rates (
  id bigint generated always as identity primary key,
  stable_id bigint not null references public.stables (id) on delete cascade,
  rider_id uuid references public.profiles (id) on delete cascade,
  from_month date not null,
  amount integer,
  constraint rates_from_month_first_day_check check (extract(day from from_month) = 1),
  constraint rates_amount_range_check check (amount between 0 and 1000000),
  constraint rates_stable_rate_has_amount_check check (rider_id is not null or amount is not null),
  constraint rates_one_change_per_month_key unique nulls not distinct (stable_id, rider_id, from_month)
);

comment on table public.rates is
  'Zmiany stawki (GLOSSARY "Stawka", #94): rider_id NULL - stawka osrodka (zawsze z kwota), inaczej stawka indywidualna jezdzca (kwota NULL - powrot do stawki osrodka). from_month - pierwszy dzien miesiaca "od"; amount w groszach 0..1 000 000. Jedna zmiana na (osrodek, jezdziec, miesiac).';
comment on column public.rates.amount is
  'Kwota w groszach (liczba calkowita). NULL tylko przy stawce indywidualnej: od from_month jezdziec wraca do stawki osrodka.';

create index rates_rider_id_idx on public.rates (rider_id) where rider_id is not null;

alter table public.rates enable row level security;

revoke all on public.rates from anon;
grant select, insert, update, delete on public.rates to authenticated;

-- ---------------------------------------------------------------------------
-- Reguly czasu
-- ---------------------------------------------------------------------------

create function public.enforce_rate_month_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_current date := private.warsaw_month_start();
begin
  if tg_op = 'DELETE' then
    -- Kaskada (usuniecie konta jezdzca albo osrodka) idzie przez wyzwalacz klucza obcego,
    -- wiec ten wyzwalacz jest wtedy zagniezdzony - kaskada usuwa takze obowiazujace zmiany.
    if pg_trigger_depth() = 1 and old.from_month <= v_current then
      raise exception 'Usunac mozna tylko zaplanowana zmiane stawki' using errcode = 'SB027';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and (
    new.stable_id is distinct from old.stable_id
    or new.rider_id is distinct from old.rider_id
    or new.from_month is distinct from old.from_month
  ) then
    raise exception 'Osrodek, jezdziec i miesiac zmiany stawki sa niezmienne' using errcode = 'SB028';
  end if;

  if new.from_month not in (v_current, (v_current + interval '1 month')::date) then
    raise exception 'Stawke zmienia sie od biezacego albo od nastepnego miesiaca' using errcode = 'SB026';
  end if;
  return new;
end;
$$;

comment on function public.enforce_rate_month_rules() is
  'Reguly czasu stawek (#94): zapis tylko od biezacego albo nastepnego miesiaca (Europe/Warsaw) - SB026; usuniecie tylko zmiany zaplanowanej - SB027 (kaskada usuwa wszystko); osrodek, jezdziec i miesiac niezmienne - SB028. Takze jako postgres.';

revoke execute on function public.enforce_rate_month_rules() from public, anon, authenticated;

create trigger rates_month_rules
before insert or update or delete on public.rates
for each row execute function public.enforce_rate_month_rules();

-- ---------------------------------------------------------------------------
-- Polityki RLS: tylko wlasciciel swojego osrodka
-- ---------------------------------------------------------------------------

create policy rates_select_owner on public.rates
  for select to authenticated
  using (stable_id = (select private.owned_stable_id()));

create policy rates_insert_owner on public.rates
  for insert to authenticated
  with check (
    stable_id = (select private.owned_stable_id())
    and (rider_id is null or private.is_rider_of_my_stable(rider_id))
  );

create policy rates_update_owner on public.rates
  for update to authenticated
  using (stable_id = (select private.owned_stable_id()))
  with check (
    stable_id = (select private.owned_stable_id())
    and (rider_id is null or private.is_rider_of_my_stable(rider_id))
  );

create policy rates_delete_owner on public.rates
  for delete to authenticated
  using (stable_id = (select private.owned_stable_id()));
