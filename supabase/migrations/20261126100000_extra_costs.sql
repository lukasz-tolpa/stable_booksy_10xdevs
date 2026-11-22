-- Koszty dodatkowe (#96, spec #93, GLOSSARY "Koszt dodatkowy").
--
-- Jeden wiersz to jedna pozycja rozliczenia poza jazdami, dopisana przez wlasciciela jednemu jezdzcowi
-- na jeden miesiac (takze gdy jezdziec nie mial w nim jazdy):
--   * month - pierwszy dzien miesiaca kalendarzowego (strefa Europe/Warsaw, jak definicja jazdy),
--   * name - nazwa, np. "Pensjonat konia": 1-80 znakow, przycieta (aplikacja przycina, baza pilnuje),
--   * amount - grosze jako liczba calkowita, 1..10 000 000 (0,01-100 000,00 zl), nigdy float,
--   * created_at / updated_at - znaczniki utworzenia i ostatniej poprawki.
-- "Do zapłaty" = kwota za jazdy + suma kosztow liczy aplikacja (src/lib/settlements/settlements.ts).
--
-- Regula czasu (wyzwalacz extra_costs_month_rules, takze dla postgres): koszt tylko w biezacym albo
-- minionym miesiacu - przyszly miesiac to SB029. Poprawka i usuniecie dzialaja w kazdym miesiacu.
-- Poprawic mozna tylko nazwe i kwote (UPDATE na pozostale kolumny nie jest nadany - 42501).
-- Dostep (RLS): wylacznie wlasciciel, w obrebie private.owned_stable_id(); zapis tylko dla jezdzca
-- osrodka (private.is_rider_of_my_stable - konto z jakimkolwiek zapisem w osrodku, takze odwolanym).
-- Instruktor (takze z uprawnieniem do ukladania grafiku) i jezdziec nie maja zadnej polityki.
-- Usuniecie konta jezdzca usuwa jego koszty (FK on delete cascade, ADR-0001); osrodka - tak samo.
--
-- Dowod: supabase/tests/settlement_extra_costs.sql.

create table public.extra_costs (
  id bigint generated always as identity primary key,
  stable_id bigint not null references public.stables (id) on delete cascade,
  rider_id uuid not null references public.profiles (id) on delete cascade,
  month date not null,
  name text not null,
  amount integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint extra_costs_month_first_day_check check (extract(day from month) = 1),
  constraint extra_costs_name_check check (name = btrim(name) and char_length(name) between 1 and 80),
  constraint extra_costs_amount_range_check check (amount between 1 and 10000000)
);

comment on table public.extra_costs is
  'Koszty dodatkowe (GLOSSARY "Koszt dodatkowy", #96): pozycja rozliczenia poza jazdami jednego jezdzca w jednym miesiacu. month - pierwszy dzien miesiaca (biezacy albo miniony, SB029); name 1-80 znakow przycieta; amount w groszach 1..10 000 000.';
comment on column public.extra_costs.amount is
  'Kwota w groszach (liczba calkowita), 1..10 000 000 (0,01-100 000,00 zl).';

create index extra_costs_stable_month_idx on public.extra_costs (stable_id, month);
create index extra_costs_rider_id_idx on public.extra_costs (rider_id);

alter table public.extra_costs enable row level security;

revoke all on public.extra_costs from anon;
revoke all on public.extra_costs from authenticated;
grant select, insert, delete on public.extra_costs to authenticated;
-- Poprawka to nazwa i kwota; osrodek, jezdziec i miesiac pozycji sa niezmienne.
grant update (name, amount) on public.extra_costs to authenticated;

-- ---------------------------------------------------------------------------
-- Regula czasu i znacznik zmiany
-- ---------------------------------------------------------------------------

create function public.enforce_extra_cost_month_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.month > private.warsaw_month_start() then
    raise exception 'Koszt dodatkowy dopisuje sie w biezacym albo minionym miesiacu' using errcode = 'SB029';
  end if;
  return new;
end;
$$;

comment on function public.enforce_extra_cost_month_rules() is
  'Regula czasu kosztow dodatkowych (#96): miesiac kosztu biezacy albo miniony (Europe/Warsaw) - inaczej SB029. Takze jako postgres.';

revoke execute on function public.enforce_extra_cost_month_rules() from public, anon, authenticated;

create trigger extra_costs_month_rules
before insert or update of month on public.extra_costs
for each row execute function public.enforce_extra_cost_month_rules();

create trigger extra_costs_set_updated_at
before update on public.extra_costs
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Polityki RLS: tylko wlasciciel swojego osrodka
-- ---------------------------------------------------------------------------

create policy extra_costs_select_owner on public.extra_costs
  for select to authenticated
  using (stable_id = (select private.owned_stable_id()));

create policy extra_costs_insert_owner on public.extra_costs
  for insert to authenticated
  with check (
    stable_id = (select private.owned_stable_id())
    and private.is_rider_of_my_stable(rider_id)
  );

create policy extra_costs_update_owner on public.extra_costs
  for update to authenticated
  using (stable_id = (select private.owned_stable_id()))
  with check (
    stable_id = (select private.owned_stable_id())
    and private.is_rider_of_my_stable(rider_id)
  );

create policy extra_costs_delete_owner on public.extra_costs
  for delete to authenticated
  using (stable_id = (select private.owned_stable_id()));
