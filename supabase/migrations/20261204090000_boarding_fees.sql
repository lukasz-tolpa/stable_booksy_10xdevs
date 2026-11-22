-- Rozliczenie pensjonariusza (#117, spec #112, ADR 0005, GLOSSARY „Stawka”, „Opłata za pensjonat”).
--
-- Zakres:
--   * rates.kind: 'recreation' (stawka rekreacyjna - jazda na koniu osrodka) albo 'training' (stawka
--     treningowa - jazda pensjonariusza na jego koniu pensjonatowym); istniejace stawki sa rekreacyjne.
--     Unikalnosc zmiany stawki obejmuje rodzaj: (osrodek, jezdziec-lub-brak, rodzaj, miesiac). Reguly
--     czasu (SB026-SB028) obowiazuja jak dotad, osobno dla kazdego rodzaju; rodzaj wiersza jest
--     niezmienny (SB028). Stawka indywidualna ma rodzaj stawki jezdzca (pensjonariusz - treningowa).
--     Ktora stawka obowiazuje (takze „pierwsza stawka osrodka dziala wstecz” - osobno dla rodzaju),
--     liczy aplikacja (src/lib/settlements/rates.ts).
--   * public.boarding_fees - oplata za pensjonat: kwota w groszach dla jednego konia pensjonatowego od
--     wskazanego miesiaca, wzorem stawki. Jedna zmiana na (kon, miesiac); zapis na zajety miesiac
--     nadpisuje kwote (upsert). Ktora oplata obowiazuje w miesiacu (najpozniejsza zmiana "od" <= miesiac,
--     a gdy zadnej - pierwsza zmiana konia, wstecz jak pierwsza stawka osrodka), liczy aplikacja
--     (src/lib/boarding/fees.ts). Do rozliczenia wlasciciela konia wchodzi w calosci za kazdy miesiac,
--     na ktory zachodzi pobyt.
--     Reguly czasu (wyzwalacz boarding_fees_month_rules, takze dla postgres):
--       - zapis zmiany tylko od biezacego albo nastepnego miesiaca (Europe/Warsaw) - SB060,
--       - usuniecie tylko zaplanowanej zmiany - SB061 (kaskada - usuniecie konia albo osrodka - usuwa wszystko),
--       - kon, osrodek i miesiac zmiany sa niezmienne - SB062.
--     Klucz obcy (horse_id, stable_id) -> horse_owners: oplata tylko dla konia pensjonatowego tego
--     osrodka (kon osrodka, cudzy kon - 23503). Usuniecie konta pensjonariusza nie rusza oplat - kon
--     zostaje w osrodku bez wlasciciela (#120).
--     Dostep (RLS): zapis wylacznie wlasciciel osrodka (private.owned_stable_id()); odczyt wlasciciel
--     osrodka i pensjonariusz - wlasciciel konia („Moje konie”). Inni jezdzcy, instruktorzy i inne
--     osrodki: zero wierszy.
--
-- Kody SB060-SB062 (#117; SB054-SB059 zostawione wolne dla rownoleglych zadan). Nastepny wolny: SB063.
-- Dowod: supabase/tests/settlement_rates.sql (rodzaje stawek), supabase/tests/boarding_fees.sql.

-- ---------------------------------------------------------------------------
-- 1. Rodzaj stawki
-- ---------------------------------------------------------------------------

alter table public.rates
  add column kind text not null default 'recreation',
  add constraint rates_kind_check check (kind in ('recreation', 'training'));

comment on column public.rates.kind is
  'Rodzaj stawki (#117): recreation - stawka rekreacyjna (jazda na koniu osrodka), training - stawka treningowa (jazda pensjonariusza na jego koniu). Stawka indywidualna ma rodzaj stawki jezdzca. Niezmienny (SB028).';

alter table public.rates drop constraint rates_one_change_per_month_key;
alter table public.rates
  add constraint rates_one_change_per_month_key unique nulls not distinct (stable_id, rider_id, kind, from_month);

create or replace function public.enforce_rate_month_rules()
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
    or new.kind is distinct from old.kind
    or new.from_month is distinct from old.from_month
  ) then
    raise exception 'Osrodek, jezdziec, rodzaj i miesiac zmiany stawki sa niezmienne' using errcode = 'SB028';
  end if;

  if new.from_month not in (v_current, (v_current + interval '1 month')::date) then
    raise exception 'Stawke zmienia sie od biezacego albo od nastepnego miesiaca' using errcode = 'SB026';
  end if;
  return new;
end;
$$;

comment on function public.enforce_rate_month_rules() is
  'Reguly czasu stawek (#94, #117): zapis tylko od biezacego albo nastepnego miesiaca (Europe/Warsaw) - SB026; usuniecie tylko zmiany zaplanowanej - SB027 (kaskada usuwa wszystko); osrodek, jezdziec, rodzaj i miesiac niezmienne - SB028. Takze jako postgres.';

-- ---------------------------------------------------------------------------
-- 2. Oplata za pensjonat
-- ---------------------------------------------------------------------------

create table public.boarding_fees (
  id bigint generated always as identity primary key,
  horse_id bigint not null,
  stable_id bigint not null,
  from_month date not null,
  amount integer not null,
  created_at timestamptz not null default now(),
  constraint boarding_fees_horse_fkey
    foreign key (horse_id, stable_id) references public.horse_owners (horse_id, stable_id) on delete cascade,
  constraint boarding_fees_from_month_first_day_check check (extract(day from from_month) = 1),
  constraint boarding_fees_amount_range_check check (amount between 0 and 10000000),
  constraint boarding_fees_one_change_per_month_key unique (horse_id, from_month)
);

comment on table public.boarding_fees is
  'Oplata za pensjonat (GLOSSARY, #117): zmiany miesiecznej kwoty za jednego konia pensjonatowego. from_month - pierwszy dzien miesiaca "od" (biezacy albo nastepny, SB060); amount w groszach 0..10 000 000. Jedna zmiana na (kon, miesiac). Pisze tylko wlasciciel osrodka, czyta on i wlasciciel konia.';
comment on column public.boarding_fees.amount is
  'Kwota w groszach (liczba calkowita), 0..10 000 000 (0,00-100 000,00 zl).';

create index boarding_fees_stable_id_idx on public.boarding_fees (stable_id);

alter table public.boarding_fees enable row level security;

revoke all on public.boarding_fees from anon;
revoke all on public.boarding_fees from authenticated;
-- Upsert PostgREST (on conflict do update) przepisuje wszystkie kolumny ladunku - niezmiennosc konia,
-- osrodka i miesiaca pilnuje wyzwalacz (SB062), nie uprawnienia kolumn.
grant select, insert, update, delete on public.boarding_fees to authenticated;

create function public.enforce_boarding_fee_month_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_current date := private.warsaw_month_start();
begin
  if tg_op = 'DELETE' then
    -- Kaskada (usuniecie konia albo osrodka) jest zagniezdzona - usuwa takze obowiazujace zmiany.
    if pg_trigger_depth() = 1 and old.from_month <= v_current then
      raise exception 'Usunac mozna tylko zaplanowana zmiane oplaty za pensjonat' using errcode = 'SB061';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and (
    new.horse_id is distinct from old.horse_id
    or new.stable_id is distinct from old.stable_id
    or new.from_month is distinct from old.from_month
  ) then
    raise exception 'Kon, osrodek i miesiac zmiany oplaty za pensjonat sa niezmienne' using errcode = 'SB062';
  end if;

  if new.from_month not in (v_current, (v_current + interval '1 month')::date) then
    raise exception 'Oplate za pensjonat zmienia sie od biezacego albo od nastepnego miesiaca' using errcode = 'SB060';
  end if;
  return new;
end;
$$;

comment on function public.enforce_boarding_fee_month_rules() is
  'Reguly czasu oplaty za pensjonat (#117), wzorem stawek: zapis tylko od biezacego albo nastepnego miesiaca (Europe/Warsaw) - SB060; usuniecie tylko zmiany zaplanowanej - SB061 (kaskada usuwa wszystko); kon, osrodek i miesiac niezmienne - SB062. Takze jako postgres.';

revoke execute on function public.enforce_boarding_fee_month_rules() from public, anon, authenticated;

create trigger boarding_fees_month_rules
before insert or update or delete on public.boarding_fees
for each row execute function public.enforce_boarding_fee_month_rules();

create policy boarding_fees_select_stable_or_own
  on public.boarding_fees
  for select
  to authenticated
  using (
    stable_id = (select private.owned_stable_id())
    or exists (
      select 1
      from public.horse_owners o
      where o.horse_id = boarding_fees.horse_id
        and o.rider_id = (select auth.uid())
    )
  );

create policy boarding_fees_insert_owner
  on public.boarding_fees
  for insert
  to authenticated
  with check (stable_id = (select private.owned_stable_id()));

create policy boarding_fees_update_owner
  on public.boarding_fees
  for update
  to authenticated
  using (stable_id = (select private.owned_stable_id()))
  with check (stable_id = (select private.owned_stable_id()));

create policy boarding_fees_delete_owner
  on public.boarding_fees
  for delete
  to authenticated
  using (stable_id = (select private.owned_stable_id()));
