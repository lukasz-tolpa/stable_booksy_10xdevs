-- Slot treningowy i zapis pensjonariusza na wlasnym koniu (#115, spec #112, ADR 0005, GLOSSARY „Slot”,
-- „Slot treningowy”, „Pensjonariusz”, „Przydzial konia”, „Limit miejsc”).
--
-- Zakres:
--   * schedule_slots.kind: 'recreation' (slot rekreacyjny) albo 'training' (slot treningowy); istniejace
--     sloty sa rekreacyjne. Rodzaj ustawia save_schedule_day (wpis p_seats {instructor_id, hour, seats,
--     place_id?, kind?}; brak kind = rodzaj, ktory slot juz ma, a nowy slot - rekreacyjny).
--   * Regula sumy limitow (SB007) liczy tylko sloty rekreacyjne wobec koni osrodka pracujacych tego dnia;
--     sloty treningowe jej nie zuzywaja - ich limit ogranicza tylko liczbe zapisow w slocie (SB009).
--   * Zmiana rodzaju slotu z aktywnymi zapisami: SB048 (DETAIL {"hour", "bookings"}).
--   * Zapis (wyzwalacz bookings_slot_rules, takze dla postgres - seed i dane demo trzymaja te same reguly):
--       - pensjonariusz w miesiacu dnia slotu (private.is_boarder_in_month) nie zapisuje sie na slot
--         rekreacyjny (SB049), jezdziec niebedacy pensjonariuszem - na slot treningowy (SB050);
--       - przy slocie treningowym koniem jest kon pensjonatowy zapisujacego z pobytem obejmujacym dzien
--         jazdy: jedyny przydzielany od razu, przy kilku wybrany przy zapisie (bez wyboru SB052), zaden
--         nie stoi tego dnia w osrodku: SB053; cudzy, kon osrodka albo bez pobytu: SB051;
--       - jezdziec nie wybiera konia przy zapisie na slot rekreacyjny (42501) - przydziela go osrodek.
--   * Przydzial konia (ten sam wyzwalacz przy zmianie horse_id - wlasciciel, instruktor slotu, postgres):
--       - slot rekreacyjny: kon osrodka pracujacy tego dnia (23503 z nazwa dawnego klucza obcego
--         bookings_assigned_horse_fkey - aplikacja i testy czytaja ja jak dotad);
--       - slot treningowy: kon pensjonatowy tego samego pensjonariusza z pobytem obejmujacym dzien (SB051);
--       - zdjecie konia (NULL) dozwolone jak dotad; „kon ma najwyzej jednego jezdzca w godzinie”
--         (bookings_horse_hour_key) obowiazuje dla obu rodzajow.
--     Klucz obcy bookings_assigned_horse_fkey (kon zapisu -> konie pracujace dnia) zastepuje ta regula
--     i klucz obcy bookings_horse_fkey (kon zapisu -> katalog koni); wypisania konia z przydzialem
--     dalej pilnuje save_schedule_day (SB004) - bezposredni zapis do schedule_day_horses jest odebrany.
--   * get_my_slot_horse_options: przy zapisie na slot treningowy - konie pensjonatowe zapisanego
--     pensjonariusza z pobytem obejmujacym dzien.
--
-- Kody SB048-SB053 (#115; SB034-SB039 wolne po #113, SB040-SB047 - #114). Nastepny wolny: SB054.
-- Dowod: supabase/tests/training_slots.sql.

-- ---------------------------------------------------------------------------
-- 1. Rodzaj slotu
-- ---------------------------------------------------------------------------

alter table public.schedule_slots
  add column kind text not null default 'recreation',
  add constraint schedule_slots_kind_check check (kind in ('recreation', 'training'));

comment on column public.schedule_slots.kind is
  'Rodzaj slotu (#115): recreation = slot rekreacyjny (jezdzcy rekreacyjni na koniach osrodka, liczy sie do sumy limitow), training = slot treningowy (pensjonariusze na swoich koniach pensjonatowych). Ustawia save_schedule_day.';

-- ---------------------------------------------------------------------------
-- 2. Pobyt obejmujacy dzien
-- ---------------------------------------------------------------------------

create function private.stay_covers_day(p_arrival date, p_departure date, p_day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_arrival <= p_day and (p_departure is null or p_departure >= p_day);
$$;

comment on function private.stay_covers_day(date, date, date) is
  'Czy pobyt [przyjazd, wyjazd] obejmuje dzien p_day (oba konce wlacznie; wyjazd NULL - trwa). Blizniak stayCoversDay w src/lib/boarding/month.ts.';

revoke execute on function private.stay_covers_day(date, date, date) from public, anon;
grant execute on function private.stay_covers_day(date, date, date) to authenticated;

-- Konie pensjonatowe jezdzca w osrodku z pobytem obejmujacym dzien.
create function private.boarder_horses_on_day(p_rider_id uuid, p_stable_id bigint, p_day date)
returns setof bigint
language sql
stable
security definer
set search_path = ''
as $$
  select distinct o.horse_id
  from public.horse_owners o
  join public.horse_stays s on s.horse_id = o.horse_id
  where o.rider_id = p_rider_id
    and o.stable_id = p_stable_id
    and private.stay_covers_day(s.arrival_day, s.departure_day, p_day);
$$;

comment on function private.boarder_horses_on_day(uuid, bigint, date) is
  'Konie pensjonatowe jezdzca w osrodku, ktorych pobyt obejmuje dzien - konie do wyboru przy zapisie na slot treningowy i przy jego przydziale (#115).';

revoke execute on function private.boarder_horses_on_day(uuid, bigint, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Kon zapisu: regula zamiast klucza obcego do koni pracujacych dnia
-- ---------------------------------------------------------------------------

alter table public.bookings drop constraint bookings_assigned_horse_fkey;

alter table public.bookings
  add constraint bookings_horse_fkey
  foreign key (horse_id) references public.horses (id) on delete restrict;

comment on column public.bookings.horse_id is
  'Kon zapisu; NULL = jeszcze bez konia. Wylacznie przy zapisie aktywnym. Slot rekreacyjny: kon osrodka pracujacy tego dnia; slot treningowy: kon pensjonatowy zapisanego pensjonariusza z pobytem obejmujacym dzien (wyzwalacz bookings_slot_rules, #115).';

create function public.enforce_booking_slot_rules()
returns trigger
language plpgsql
-- SECURITY DEFINER celowo: regula czyta pobyty i wlascicieli koni (zamkniete dla jezdzcow i instruktorow)
-- oraz konie pracujace dnia.
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_stable bigint;
  v_day date;
  v_boarder boolean;
  v_horses bigint[];
begin
  -- Odwolany zapis nie ma konia ani miejsca (bookings_cancellation odpala wczesniej i czysci konia).
  if new.status <> 'active' then
    return new;
  end if;

  -- Istnienie dnia i slotu sprawdzil juz bookings_seat_limit (kolejnosc alfabetyczna) przy INSERT;
  -- przy zmianie konia slot moze juz nie istniec (instruktor wypisany) - wtedy slot rekreacyjny.
  select sd.stable_id, sd.day into v_stable, v_day
  from public.schedule_days sd
  where sd.id = new.schedule_day_id;

  select s.kind into v_kind
  from public.schedule_slots s
  where s.schedule_day_id = new.schedule_day_id
    and s.instructor_id = new.instructor_id
    and s.hour = new.hour;
  v_kind := coalesce(v_kind, 'recreation');

  if tg_op = 'INSERT' and new.rider_id is not null then
    v_boarder := private.is_boarder_in_month(new.rider_id, v_stable, v_day);

    if v_kind = 'recreation' and v_boarder then
      raise exception 'Pensjonariusz nie zapisuje sie na slot rekreacyjny' using errcode = 'SB049';
    end if;
    if v_kind = 'training' and not v_boarder then
      raise exception 'Na slot treningowy zapisuja sie tylko pensjonariusze' using errcode = 'SB050';
    end if;

    if v_kind = 'recreation' and new.horse_id is not null and private.current_role() = 'rider' then
      raise exception 'Konia do jazdy rekreacyjnej przydziela osrodek' using errcode = '42501';
    end if;

    if v_kind = 'training' and new.horse_id is null then
      v_horses := array(select private.boarder_horses_on_day(new.rider_id, v_stable, v_day));
      if cardinality(v_horses) = 0 then
        raise exception 'Zaden kon jezdzca nie stoi w osrodku w dniu jazdy' using errcode = 'SB053';
      end if;
      if cardinality(v_horses) > 1 then
        raise exception 'Jezdziec ma kilka koni - przy zapisie trzeba wybrac konia' using errcode = 'SB052';
      end if;
      new.horse_id := v_horses[1];
    end if;
  end if;

  if new.horse_id is null or (tg_op = 'UPDATE' and new.horse_id is not distinct from old.horse_id) then
    return new;
  end if;

  if v_kind = 'recreation' then
    if not exists (
      select 1 from public.schedule_day_horses sdh
      where sdh.schedule_day_id = new.schedule_day_id and sdh.horse_id = new.horse_id
    ) then
      -- Ten sam kod i nazwa co dawny klucz obcy: aplikacja tlumaczy je jak dotad.
      raise exception 'Kon % nie pracuje w dniu %', new.horse_id, v_day
        using errcode = '23503', constraint = 'bookings_assigned_horse_fkey';
    end if;
  elsif new.rider_id is null or not exists (
    select 1 from private.boarder_horses_on_day(new.rider_id, v_stable, v_day) h(id)
    where h.id = new.horse_id
  ) then
    raise exception 'Przy slocie treningowym koniem jest kon pensjonatowy zapisanego z pobytem w dniu jazdy'
      using errcode = 'SB051';
  end if;

  return new;
end;
$$;

comment on function public.enforce_booking_slot_rules() is
  'Zapis i kon wobec rodzaju slotu (#115): pensjonariusz w miesiacu nie na slot rekreacyjny (SB049), nie-pensjonariusz nie na treningowy (SB050); slot treningowy - kon pensjonatowy zapisujacego z pobytem obejmujacym dzien (jedyny od razu; kilka bez wyboru SB052; zaden SB053; cudzy/osrodka/bez pobytu SB051); slot rekreacyjny - kon pracujacy dnia (23503 bookings_assigned_horse_fkey), jezdziec konia nie wybiera (42501).';

revoke execute on function public.enforce_booking_slot_rules() from public, anon, authenticated;

create trigger bookings_slot_rules
before insert or update of horse_id on public.bookings
for each row execute function public.enforce_booking_slot_rules();

comment on function public.enforce_booking_horse_assignment() is
  'Przydzial konia (#42, #71, #81): horse_id zapisu aktywnego zmienia wlasciciel osrodka albo aktywny instruktor, do ktorego slotu nalezy zapis (42501 dla jezdzca i cudzego instruktora). Ktory kon wolno przydzielic (slot rekreacyjny / treningowy), pilnuje bookings_slot_rules (#115), jeden zapis konia w godzinie - indeks bookings_horse_hour_key.';

-- ---------------------------------------------------------------------------
-- 4. save_schedule_day - cialo z 20261201090000 plus rodzaj slotu
-- ---------------------------------------------------------------------------

create or replace function public.save_schedule_day(
  p_day date,
  p_open_hour int,
  p_close_hour int,
  p_horse_ids bigint[],
  p_instructor_ids bigint[],
  p_seats jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
-- SECURITY DEFINER celowo: bezposredni zapis do tabel grafiku jest odebrany, a funkcja
-- musi widziec wszystkie zapisy dnia. Stadnine bierze z sesji (private.schedule_stable_id),
-- nigdy z argumentu.
security definer
set search_path = ''
as $$
declare
  v_stable bigint := private.schedule_stable_id();
  v_horses bigint[] := array(select distinct x from unnest(coalesce(p_horse_ids, '{}')) x);
  v_instructors bigint[] := array(select distinct x from unnest(coalesce(p_instructor_ids, '{}')) x);
  v_seats jsonb := coalesce(p_seats, '[]'::jsonb);
  v_day_id bigint;
  v_default_place bigint;
  v_grid jsonb;
  v_horse_count int;
  v_hour int;
  v_sum int;
  v_count int;
begin
  if v_stable is null then
    raise exception 'Grafik dnia zapisuje wlasciciel osrodka albo instruktor z uprawnieniem do ukladania grafiku'
      using errcode = '42501';
  end if;

  if p_day < (now() at time zone 'Europe/Warsaw')::date then
    raise exception 'Nie mozna ukladac grafiku na dzien miniony %', p_day
      using errcode = 'SB008';
  end if;

  if exists (
    select 1 from unnest(v_horses) h(id)
    where not exists (select 1 from public.horses where id = h.id and stable_id = v_stable)
  ) then
    raise exception 'Kon spoza stadniny' using errcode = 'SB003';
  end if;

  if exists (
    select 1 from unnest(v_instructors) i(id)
    where not exists (select 1 from public.instructors where id = i.id and stable_id = v_stable)
  ) then
    raise exception 'Instruktor spoza stadniny' using errcode = 'SB005';
  end if;

  if jsonb_typeof(v_seats) <> 'array' or exists (
    select 1
    from jsonb_to_recordset(v_seats) as s(instructor_id bigint, hour int, seats int, kind text)
    where s.instructor_id is null or s.hour is null or s.seats is null or s.seats < 0
       or not (s.instructor_id = any (v_instructors))
       or s.hour < p_open_hour or s.hour >= p_close_hour
       or (s.kind is not null and s.kind not in ('recreation', 'training'))
  ) or exists (
    select 1
    from jsonb_to_recordset(v_seats) as s(instructor_id bigint, hour int, seats int)
    group by s.instructor_id, s.hour
    having count(*) > 1
  ) then
    raise exception 'Niespojne limity miejsc: godzina poza zakresem dnia, instruktor spoza dnia, nieznany rodzaj slotu albo duplikat'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_seats) as s(place_id bigint)
    where s.place_id is not null
      and not exists (select 1 from public.places p where p.id = s.place_id and p.stable_id = v_stable)
  ) then
    raise exception 'Plac spoza osrodka' using errcode = 'SB030';
  end if;

  -- Blokada wiersza dnia serializuje rownolegle zapisy grafiku tego dnia, a takze zapisy
  -- jezdzcow (ich wyzwalacz bierze FOR SHARE na tym wierszu).
  select id into v_day_id
  from public.schedule_days
  where stable_id = v_stable and day = p_day
  for update;

  if exists (
    select 1
    from public.instructors i
    where i.id = any (v_instructors)
      and not i.active
      and not exists (
        select 1 from public.schedule_day_instructors sdi
        where sdi.schedule_day_id = v_day_id and sdi.instructor_id = i.id
      )
  ) then
    raise exception 'Nieaktywnego instruktora nie mozna dodac do dnia' using errcode = 'SB006';
  end if;

  -- Pelna siatka instruktor x godzina ze stanem koncowym: limit (brak = 0), plac (brak = plac,
  -- na ktorym slot juz jest, a nowy slot - pierwszy aktywny plac osrodka) i rodzaj (brak = rodzaj,
  -- ktory slot juz ma, a nowy slot - rekreacyjny).
  v_default_place := private.default_place_id(v_stable);

  select coalesce(jsonb_agg(jsonb_build_object(
           'instructor_id', i,
           'hour', h,
           'seats', coalesce(s.seats, 0),
           'place_id', coalesce(s.place_id, cur.place_id, v_default_place),
           'kind', coalesce(s.kind, cur.kind, 'recreation')
         )), '[]'::jsonb)
    into v_grid
  from unnest(v_instructors) i
  cross join generate_series(p_open_hour, p_close_hour - 1) h
  left join jsonb_to_recordset(v_seats) as s(instructor_id bigint, hour int, seats int, place_id bigint, kind text)
    on s.instructor_id = i and s.hour = h
  left join public.schedule_slots cur
    on cur.schedule_day_id = v_day_id and cur.instructor_id = i and cur.hour = h;

  -- Nieaktywny plac zostaje w dniu, ktory juz go uzywa; do innego dnia nie trafia.
  if exists (
    select 1
    from jsonb_to_recordset(v_grid) as g(place_id bigint)
    join public.places p on p.id = g.place_id
    where not p.active
      and not exists (
        select 1 from public.schedule_slots cur
        where cur.schedule_day_id = v_day_id and cur.place_id = p.id
      )
  ) then
    raise exception 'Nieaktywnego placu nie mozna dodac do dnia' using errcode = 'SB031';
  end if;

  -- Zapisani jezdzcy nie wedruja na inny plac bez wiedzy osrodka (najwczesniejsza godzina).
  select g.hour, count(*)
    into v_hour, v_count
  from jsonb_to_recordset(v_grid) as g(instructor_id bigint, hour int, place_id bigint)
  join public.schedule_slots cur
    on cur.schedule_day_id = v_day_id and cur.instructor_id = g.instructor_id and cur.hour = g.hour
  join public.bookings b
    on b.schedule_day_id = v_day_id and b.instructor_id = g.instructor_id and b.hour = g.hour
   and b.status = 'active'
  where cur.place_id <> g.place_id
  group by g.instructor_id, g.hour
  order by g.hour
  limit 1;

  if v_hour is not null then
    raise exception 'Nie mozna zmienic placu slotu o godzinie %, ktory ma % aktywnych zapisow', v_hour, v_count
      using errcode = 'SB032',
            detail = jsonb_build_object('hour', v_hour, 'bookings', v_count)::text;
  end if;

  -- Rodzaj slotu z zapisami zostaje: rekreacyjni jezdzcy nie trafiaja na trening ani odwrotnie
  -- (najwczesniejsza godzina).
  select g.hour, count(*)
    into v_hour, v_count
  from jsonb_to_recordset(v_grid) as g(instructor_id bigint, hour int, kind text)
  join public.schedule_slots cur
    on cur.schedule_day_id = v_day_id and cur.instructor_id = g.instructor_id and cur.hour = g.hour
  join public.bookings b
    on b.schedule_day_id = v_day_id and b.instructor_id = g.instructor_id and b.hour = g.hour
   and b.status = 'active'
  where cur.kind <> g.kind
  group by g.instructor_id, g.hour
  order by g.hour
  limit 1;

  if v_hour is not null then
    raise exception 'Nie mozna zmienic rodzaju slotu o godzinie %, ktory ma % aktywnych zapisow', v_hour, v_count
      using errcode = 'SB048',
            detail = jsonb_build_object('hour', v_hour, 'bookings', v_count)::text;
  end if;

  -- Konia ma tylko aktywny zapis (CHECK bookings_horse_only_when_active_check), wiec odwolane
  -- zapisy nie blokuja wypisania konia. Konie pensjonatowe przy slotach treningowych nie sa
  -- konmi pracujacymi dnia - tu licza sie wylacznie konie osrodka.
  if v_day_id is not null and exists (
    select 1
    from public.bookings b
    join public.horses h on h.id = b.horse_id and h.kind = 'stable'
    where b.schedule_day_id = v_day_id
      and not (b.horse_id = any (v_horses))
  ) then
    raise exception 'Nie mozna wypisac konia przydzielonego do zapisu w tym dniu' using errcode = 'SB004';
  end if;

  -- Przed DELETE z schedule_day_instructors - kaskada skasowalaby sloty.
  if v_day_id is not null then
    select count(*) into v_count
    from public.bookings b
    where b.schedule_day_id = v_day_id
      and b.status = 'active'
      and not (b.instructor_id = any (v_instructors));

    if v_count > 0 then
      raise exception 'Nie mozna wypisac instruktora, ktory ma % aktywnych zapisow w tym dniu', v_count
        using errcode = 'SB011',
              detail = jsonb_build_object('bookings', v_count)::text;
    end if;
  end if;

  -- Zmiana godzin przechodzi przez wyzwalacz schedule_days_protect_bookings (SB002).
  insert into public.schedule_days (stable_id, day, open_hour, close_hour)
  values (v_stable, p_day, p_open_hour, p_close_hour)
  on conflict (stable_id, day) do update
    set open_hour = excluded.open_hour, close_hour = excluded.close_hour
  returning id into v_day_id;

  delete from public.schedule_day_horses
  where schedule_day_id = v_day_id and not (horse_id = any (v_horses));

  insert into public.schedule_day_horses (schedule_day_id, horse_id, stable_id)
  select v_day_id, h, v_stable from unnest(v_horses) h
  on conflict do nothing;

  -- Wypisanie instruktora kasuje kaskadowo jego sloty; odwolane zapisy zostaja (brak FK do slotu).
  delete from public.schedule_day_instructors
  where schedule_day_id = v_day_id and not (instructor_id = any (v_instructors));

  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  select v_day_id, i, v_stable from unnest(v_instructors) i
  on conflict do nothing;

  delete from public.schedule_slots
  where schedule_day_id = v_day_id and (hour < p_open_hour or hour >= p_close_hour);

  -- UPSERT, nie DELETE + INSERT: wiersz slotu przetrwa edycje, bo blokuje go zapis jezdzca.
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats, place_id, kind)
  select v_day_id, g.instructor_id, g.hour, g.seats, g.place_id, g.kind
  from jsonb_to_recordset(v_grid) as g(instructor_id bigint, hour int, seats int, place_id bigint, kind text)
  on conflict (schedule_day_id, instructor_id, hour) do update
    set seats = excluded.seats, place_id = excluded.place_id, kind = excluded.kind
    where public.schedule_slots.seats is distinct from excluded.seats
       or public.schedule_slots.place_id is distinct from excluded.place_id
       or public.schedule_slots.kind is distinct from excluded.kind;

  -- Limit nie moze spasc ponizej liczby aktywnych zapisow w slocie (najwczesniejsza godzina).
  select s.hour, s.seats, count(*)
    into v_hour, v_sum, v_count
  from public.schedule_slots s
  join public.bookings b
    on b.schedule_day_id = s.schedule_day_id
   and b.instructor_id = s.instructor_id
   and b.hour = s.hour
   and b.status = 'active'
  where s.schedule_day_id = v_day_id
  group by s.instructor_id, s.hour, s.seats
  having count(*) > s.seats
  order by s.hour
  limit 1;

  if v_hour is not null then
    raise exception 'Limit miejsc o godzinie % (%) jest nizszy niz liczba aktywnych zapisow w slocie (%)',
      v_hour, v_sum, v_count
      using errcode = 'SB010',
            detail = jsonb_build_object('hour', v_hour, 'seats', v_sum, 'bookings', v_count)::text;
  end if;

  -- Regula sumy limitow na STANIE KONCOWYM: konie i limity sa juz zapisane. Licza sie tylko sloty
  -- rekreacyjne - sloty treningowe nie zuzywaja koni osrodka.
  select count(*) into v_horse_count from public.schedule_day_horses where schedule_day_id = v_day_id;

  select s.hour, sum(s.seats)
    into v_hour, v_sum
  from public.schedule_slots s
  where s.schedule_day_id = v_day_id
    and s.kind = 'recreation'
  group by s.hour
  having sum(s.seats) > v_horse_count
  order by s.hour
  limit 1;

  if v_hour is not null then
    raise exception 'Suma limitow miejsc slotow rekreacyjnych o godzinie % (%) przekracza liczbe koni pracujacych tego dnia (%)',
      v_hour, v_sum, v_horse_count
      using errcode = 'SB007',
            detail = jsonb_build_object('hour', v_hour, 'seats', v_sum, 'horses', v_horse_count)::text;
  end if;

  return v_day_id;
end;
$$;

comment on function public.save_schedule_day(date, int, int, bigint[], bigint[], jsonb) is
  'Jedyna droga zapisu grafiku dnia (godziny, konie, instruktorzy, limity, place i rodzaje slotow) - w jednej transakcji, regula sumy limitow slotow rekreacyjnych na stanie koncowym; wlasciciel osrodka albo aktywny instruktor z uprawnieniem do ukladania grafiku (private.schedule_stable_id, 42501). p_seats: [{instructor_id, hour, seats, place_id, kind}], brakujaca godzina = 0, brak place_id = dotychczasowy plac slotu albo pierwszy aktywny plac osrodka, brak kind = dotychczasowy rodzaj albo recreation. Kody odmow w naglowkach migracji 20261113090000, 20261114090000, 20261201090000 i 20261202090000; dane odmow (DETAIL, JSON) w 20261116090000.';

-- ---------------------------------------------------------------------------
-- 5. Konie do wyboru przy zapisach na moje sloty - takze treningowe
-- ---------------------------------------------------------------------------

create or replace function public.get_my_slot_horse_options(p_from date)
returns table (booking_id bigint, horse_id bigint, horse_name text, taken boolean)
language sql
stable
-- SECURITY DEFINER celowo: instruktor nie czyta koni, pobytow ani zapisow innych instruktorow wprost.
-- Zwraca tylko znacznik zajetosci - bez jezdzca ani instruktora, ktory ma konia o tej godzinie.
security definer
set search_path = ''
as $$
  with mine as (
    select b.id, b.schedule_day_id, b.hour, b.rider_id, sd.day, sd.stable_id,
           coalesce(sl.kind, 'recreation') as kind
    from public.bookings b
    join public.schedule_days sd on sd.id = b.schedule_day_id
    left join public.schedule_slots sl
      on sl.schedule_day_id = b.schedule_day_id and sl.instructor_id = b.instructor_id and sl.hour = b.hour
    where b.instructor_id = private.current_instructor_id()
      and b.status = 'active'
      and sd.day >= p_from
  ), options as (
    select m.id as booking_id, m.schedule_day_id, m.hour, m.day, sdh.horse_id
    from mine m
    join public.schedule_day_horses sdh on sdh.schedule_day_id = m.schedule_day_id
    where m.kind = 'recreation'
    union all
    select m.id, m.schedule_day_id, m.hour, m.day, h.id
    from mine m
    cross join lateral private.boarder_horses_on_day(m.rider_id, m.stable_id, m.day) h(id)
    where m.kind = 'training' and m.rider_id is not null
  )
  select o.booking_id, h.id, h.name,
         exists (
           select 1
           from public.bookings other
           where other.schedule_day_id = o.schedule_day_id
             and other.hour = o.hour
             and other.horse_id = h.id
             and other.status = 'active'
             and other.id <> o.booking_id
         )
  from options o
  join public.horses h on h.id = o.horse_id
  order by o.day, o.hour, o.booking_id, h.name;
$$;

comment on function public.get_my_slot_horse_options(date) is
  'Konie do wyboru przy aktywnych zapisach na sloty zalogowanego instruktora od p_from (#81, #115): przy slocie rekreacyjnym konie pracujace tego dnia, przy treningowym konie pensjonatowe zapisanego pensjonariusza z pobytem obejmujacym dzien; taken = kon przydzielony innemu aktywnemu zapisowi o tej godzinie (takze na slocie innego instruktora). Bez danych jezdzca ani instruktora. Jezdziec, konto bez osrodka i instruktor nieaktywny dostaja zero wierszy.';
