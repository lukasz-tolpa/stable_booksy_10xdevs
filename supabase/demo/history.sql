-- Miniona historia Stadniny Pod Dębem - material dla strony statystyk.
--
-- Ladowanie:  npm run db:demo   (po `npx supabase db reset`; robi to tez setup e2e)
--
-- Osobno od seed.sql, bo skrypty z supabase/tests/ licza wiersze seeda (jeden zapis
-- na jezdzca, zero zapisow bez jezdzca) - po zaladowaniu tej historii `npm run test:db`
-- wymaga ponownego `npx supabase db reset`.
--
-- Model limitu miejsc (#41, ADR-0002). Pisze jako postgres z pominieciem save_schedule_day,
-- wiec sama trzyma regule sumy (suma limitow w godzinie <= liczba koni dnia) i limity slotow.
--
-- Zawartosc (wszystko przed dzisiejszym dniem, wiec jutrzejszy grafik seeda zostaje nietkniety):
--   * grafik 10-16 na ostatnie 24 dni bez poniedzialkow; Bella i Kasztan codziennie,
--     Iskra w weekendy
--   * instruktorzy z seeda: Joanna Wrona i Karol Jasny po 1 miejscu w kazdej godzinie,
--     w weekendy Joanna 2 (3 konie); Karol prowadzi jazdy na Kasztanie, Joanna - na Belli i Iskrze
--   * jazdy Anny i Piotra wedlug stalego wzoru z numeru dnia, godziny i konia, z przydzielonym
--     koniem; jeden jezdziec najwyzej raz w godzinie (trzeci kon w godzinie zostaje bez jazdy)
--   * dwie jazdy bez konia (ADR-0002: osrodek nie przydzielil konia) - dwa najwczesniejsze
--     zapisy ostatniego dnia grafiku; licza sie do jazd jezdzca, nie do obciazenia konia
--   * odwolania Piotra na czesci wolnych slotow (bez konia - odwolanie czysci przydzial)
--   * odwolania przez osrodek (Anna, co trzeci dzien z ostatnich 14 o 15:00) - licza sie
--     w odwolaniach okresu, ale nie przy jezdzcu; plus jedno o 16:00 ostatniego dnia grafiku,
--     czyli poza godzinami dnia (slot zniknal po skroceniu dnia) - nadal jest odwolaniem
--   * jazdy bez jezdzca (ADR-0001) o 12:00 w dniach starszych niz 15 dni
--   * dzien sprzed 30 dni z grafikiem i bez zadnego zapisu
--   * (#115, blok na koncu pliku) sloty treningowe Marka Dębowskiego w srody i soboty o 10 z jazdami
--     pensjonariuszki Katarzyny Zając na Hrabi
--
-- Idempotentne: druga proba konczy sie komunikatem, bez zmian.

do $$
declare
  v_stable bigint;
  v_anna constant uuid := '33333333-3333-3333-3333-333333333333';
  v_piotr constant uuid := '44444444-4444-4444-4444-444444444444';
begin
  select id into strict v_stable from public.stables where name = 'Stadnina Pod Dębem';

  if exists (select 1 from public.schedule_days where stable_id = v_stable and day < current_date) then
    raise notice 'Historia demo jest juz zaladowana - bez zmian.';
    return;
  end if;

  insert into public.schedule_days (stable_id, day, open_hour, close_hour)
  select v_stable, d::date, 10, 16
  from generate_series(current_date - 24, current_date - 1, interval '1 day') as d
  where extract(isodow from d) <> 1;

  insert into public.schedule_days (stable_id, day, open_hour, close_hour)
  values (v_stable, current_date - 30, 10, 16);

  insert into public.schedule_day_horses (schedule_day_id, horse_id, stable_id)
  select sd.id, h.id, v_stable
  from public.schedule_days sd
  -- Tylko konie osrodka: kon pensjonatowy (Hrabia, #114) nie pracuje w grafiku (SB046).
  join public.horses h on h.stable_id = v_stable and h.kind = 'stable'
  where sd.stable_id = v_stable
    and sd.day < current_date
    and (h.name in ('Bella', 'Kasztan') or extract(isodow from sd.day) in (6, 7));

  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  select sd.id, i.id, v_stable
  from public.schedule_days sd
  join public.instructors i on i.stable_id = v_stable and i.name in ('Joanna Wrona', 'Karol Jasny')
  where sd.stable_id = v_stable and sd.day < current_date;

  -- Suma limitow = liczba koni dnia (2 w tygodniu, 3 w weekend).
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats)
  select sdi.schedule_day_id,
         sdi.instructor_id,
         hr,
         case when i.name = 'Joanna Wrona' and extract(isodow from sd.day) in (6, 7) then 2 else 1 end
  from public.schedule_day_instructors sdi
  join public.schedule_days sd on sd.id = sdi.schedule_day_id
  join public.instructors i on i.id = sdi.instructor_id
  cross join generate_series(10, 15) as hr
  where sd.stable_id = v_stable and sd.day < current_date;

  -- Aktywne zapisy w minionych godzinach = jazdy, kazda z koniem. Kandydaci (kon, godzina)
  -- wedlug dawnego wzoru; w godzinie pierwszy kandydat dostaje jednego jezdzca, drugi -
  -- drugiego, trzeci odpada (jezdziec ma najwyzej jeden zapis na godzine).
  insert into public.bookings (schedule_day_id, instructor_id, horse_id, hour, rider_id)
  select c.schedule_day_id,
         i.id,
         c.horse_id,
         c.hr::smallint,
         case when (c.rank + c.doy + c.hr) % 2 = 0 then v_anna else v_piotr end
  from (
    select sdh.schedule_day_id,
           sdh.horse_id,
           h.name as horse_name,
           hr,
           extract(doy from sd.day)::int as doy,
           row_number() over (partition by sdh.schedule_day_id, hr order by sdh.horse_id) as rank
    from public.schedule_day_horses sdh
    join public.schedule_days sd on sd.id = sdh.schedule_day_id
    join public.horses h on h.id = sdh.horse_id
    cross join generate_series(10, 15) as hr
    where sd.stable_id = v_stable
      and sd.day between current_date - 24 and current_date - 1
      and (extract(doy from sd.day)::int * 7 + hr * 3 + sdh.horse_id * 5) % 4 < 2
  ) c
  join public.instructors i
    on i.stable_id = v_stable
   and i.name = case when c.horse_name = 'Kasztan' then 'Karol Jasny' else 'Joanna Wrona' end
  where c.rank <= 2;

  -- Odwolania Piotra: bez konia, u instruktora wedlug tego samego podzialu; tylko w godzinach,
  -- w ktorych Piotr nie ma jazdy (odwolany zapis nie zajmuje miejsca, ale zostawiamy wzor czytelny).
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status, cancelled_at, cancelled_by)
  select sdh.schedule_day_id,
         i.id,
         hr::smallint,
         v_piotr,
         'cancelled',
         sd.day - interval '1 day',
         'rider'
  from public.schedule_day_horses sdh
  join public.schedule_days sd on sd.id = sdh.schedule_day_id
  join public.horses h on h.id = sdh.horse_id
  join public.instructors i
    on i.stable_id = v_stable
   and i.name = case when h.name = 'Kasztan' then 'Karol Jasny' else 'Joanna Wrona' end
  cross join generate_series(10, 15) as hr
  where sd.stable_id = v_stable
    and sd.day between current_date - 24 and current_date - 1
    and (extract(doy from sd.day)::int * 7 + hr * 3 + sdh.horse_id * 5) % 4 = 3
    and (extract(doy from sd.day)::int + hr) % 5 = 0
    and not exists (
      select 1 from public.bookings b
      where b.schedule_day_id = sdh.schedule_day_id and b.hour = hr and b.rider_id = v_piotr
    );

  -- Jazdy bez konia: dwa najwczesniejsze zapisy ostatniego dnia grafiku (zawsze w okresie
  -- e2e, nigdy o 12:00 starszym niz 15 dni, wiec zostaja przy jezdzcu).
  update public.bookings b
  set horse_id = null
  where b.id in (
    select b2.id
    from public.bookings b2
    join public.schedule_days sd on sd.id = b2.schedule_day_id
    where sd.stable_id = v_stable
      and sd.day = (select max(day) from public.schedule_days where stable_id = v_stable and day < current_date)
      and b2.status = 'active'
    order by b2.hour, b2.id
    limit 2
  );

  -- Odwolania przez osrodek: Anna u Joanny o 15:00. Odwolany zapis nie zajmuje miejsca
  -- (wyzwalacz limitu pomija nieaktywne) i nie ma konia (odwolanie czysci przydzial).
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status, cancelled_at, cancelled_by)
  select sd.id, i.id, 15, v_anna, 'cancelled', sd.day - interval '1 day', 'stable'
  from public.schedule_days sd
  join public.instructors i on i.stable_id = v_stable and i.name = 'Joanna Wrona'
  where sd.stable_id = v_stable
    and sd.day between current_date - 14 and current_date - 1
    and extract(doy from sd.day)::int % 3 = 0;

  -- Odwolanie, ktorego slot zniknal: o 16:00, poza godzinami dnia 10-16 - jak po skroceniu dnia.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status, cancelled_at, cancelled_by)
  select sd.id, i.id, 16, v_anna, 'cancelled', sd.day - interval '1 day', 'stable'
  from public.schedule_days sd
  join public.instructors i on i.stable_id = v_stable and i.name = 'Karol Jasny'
  where sd.stable_id = v_stable
    and sd.day = (select max(day) from public.schedule_days where stable_id = v_stable and day < current_date);

  update public.bookings b
  set rider_id = null
  from public.schedule_days sd
  where sd.id = b.schedule_day_id
    and sd.stable_id = v_stable
    and sd.day < current_date - 15
    and b.status = 'active'
    and b.hour = 12;

  raise notice 'Historia demo zaladowana.';
end
$$;

select count(*) filter (where b.status = 'active') as jazdy,
       count(*) filter (where b.status = 'cancelled') as odwolania,
       count(*) filter (where b.cancelled_by = 'stable') as odwolania_osrodka,
       count(*) filter (where b.rider_id is null) as bez_jezdzca,
       count(*) filter (where b.status = 'active' and b.horse_id is null) as jazdy_bez_konia
from public.bookings b
join public.schedule_days sd on sd.id = b.schedule_day_id
join public.stables s on s.id = sd.stable_id
where s.name = 'Stadnina Pod Dębem' and sd.day < current_date;

-- #113 Place (spec #112): w historii Karol prowadzi jazdy na "Duży plac", Joanna zostaje na "Hala"
-- (pierwszy plac osrodka, na ktory trafily sloty bez placu). Idempotentne.
update public.schedule_slots sl
   set place_id = p.id
  from public.schedule_days sd, public.instructors i, public.places p
 where sd.id = sl.schedule_day_id
   and i.id = sl.instructor_id and i.name = 'Karol Jasny'
   and p.stable_id = sd.stable_id and p.name = 'Duży plac'
   and sd.stable_id = (select id from public.stables where name = 'Stadnina Pod Dębem')
   and sd.day < current_date
   and sl.place_id is distinct from p.id;

-- #115 Slot treningowy (spec #112): w srody i soboty historii wlasciciel Marek Dębowski prowadzi o 10 slot
-- treningowy (1 miejsce) na "Duży plac", a pensjonariuszka Katarzyna Zając jezdzi na nim na swoim koniu
-- pensjonatowym Hrabi (pobyt od 90 dni obejmuje cala historie). Pelna siatka godzin 10-15 jak z
-- save_schedule_day; poza 10 limit 0. Slot treningowy nie liczy sie do sumy limitow (SB007), wiec
-- regula sumy historii zostaje spelniona. Idempotentne.
do $$
declare
  v_stable bigint;
  v_kasia constant uuid := '12121212-1212-1212-1212-121212121212';
begin
  select id into strict v_stable from public.stables where name = 'Stadnina Pod Dębem';

  if exists (
    select 1
    from public.schedule_slots sl
    join public.schedule_days sd on sd.id = sl.schedule_day_id
    where sd.stable_id = v_stable and sd.day < current_date and sl.kind = 'training'
  ) then
    raise notice 'Sloty treningowe historii demo sa juz zaladowane - bez zmian.';
    return;
  end if;

  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  select sd.id, i.id, v_stable
  from public.schedule_days sd
  join public.stables s on s.id = sd.stable_id
  join public.instructors i on i.stable_id = v_stable and i.account_id = s.owner_id
  where sd.stable_id = v_stable
    and sd.day between current_date - 24 and current_date - 1
    and extract(isodow from sd.day) in (3, 6);

  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats, place_id, kind)
  select sdi.schedule_day_id, sdi.instructor_id, hr, case when hr = 10 then 1 else 0 end, p.id, 'training'
  from public.schedule_day_instructors sdi
  join public.schedule_days sd on sd.id = sdi.schedule_day_id
  join public.stables s on s.id = sd.stable_id
  join public.instructors i on i.id = sdi.instructor_id and i.account_id = s.owner_id
  join public.places p on p.stable_id = v_stable and p.name = 'Duży plac'
  cross join generate_series(10, 15) as hr
  where sd.stable_id = v_stable and sd.day < current_date;

  -- Kon nie podany - wyzwalacz bookings_slot_rules przydziela jedynego konia pensjonariuszki z pobytem.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  select sl.schedule_day_id, sl.instructor_id, sl.hour, v_kasia
  from public.schedule_slots sl
  join public.schedule_days sd on sd.id = sl.schedule_day_id
  where sd.stable_id = v_stable and sd.day < current_date and sl.kind = 'training' and sl.seats > 0;

  raise notice 'Sloty treningowe historii demo zaladowane.';
end
$$;

-- #117 Rozliczenie pensjonariusza (spec #112): stawka treningowa osrodka Pod Dębem 150,00 zl i oplata
-- za pensjonat Hrabi 1 500,00 zl miesiecznie, obie od biezacego miesiaca (pierwsza dziala wstecz), wiec
-- rozliczenie Katarzyny Zajac ma "Jazdy: N x stawka treningowa", oplate za pensjonat i "Do zapłaty".
-- Stawki rekreacyjnej demo nie ustawia (strona "Rozliczenia" prosi o nia). Specyfikacje e2e rozliczen
-- usuwaja stawki i oplaty osrodka przed soba i po sobie. Idempotentne.
do $$
declare
  v_stable bigint;
begin
  select id into strict v_stable from public.stables where name = 'Stadnina Pod Dębem';

  insert into public.rates (stable_id, rider_id, kind, from_month, amount)
  values (v_stable, null, 'training', private.warsaw_month_start(), 15000)
  on conflict (stable_id, rider_id, kind, from_month) do nothing;

  insert into public.boarding_fees (horse_id, stable_id, from_month, amount)
  select o.horse_id, o.stable_id, private.warsaw_month_start(), 150000
  from public.horse_owners o
  join public.horses h on h.id = o.horse_id
  where o.stable_id = v_stable and h.name = 'Hrabia'
  on conflict (horse_id, from_month) do nothing;

  raise notice 'Stawka treningowa i oplata za pensjonat Hrabi w historii demo.';
end
$$;
