-- Miniona historia Stadniny Pod Debem - material dla strony statystyk.
--
-- Ladowanie:  npm run db:demo   (po `npx supabase db reset`; robi to tez setup e2e)
--
-- Osobno od seed.sql, bo skrypty z supabase/tests/ licza wiersze seeda (jeden zapis
-- na jezdzca, zero zapisow bez jezdzca) - po zaladowaniu tej historii `npm run test:db`
-- wymaga ponownego `npx supabase db reset`.
--
-- Zawartosc (wszystko przed dzisiejszym dniem, wiec jutrzejszy grafik seeda zostaje nietkniety):
--   * grafik 10-16 na ostatnie 24 dni bez poniedzialkow; Bella i Kasztan codziennie,
--     Iskra w weekendy
--   * jazdy Anny i Piotra wedlug stalego wzoru z numeru dnia, godziny i konia
--   * odwolania Piotra na czesci wolnych slotow
--   * jazdy bez jezdzca (ADR-0001) o 12:00 w dniach starszych niz 15 dni
--   * dzien sprzed 30 dni z grafikiem i bez zadnego zapisu
--
-- Idempotentne: druga proba konczy sie komunikatem, bez zmian.

do $$
declare
  v_stable bigint;
  v_anna constant uuid := '33333333-3333-3333-3333-333333333333';
  v_piotr constant uuid := '44444444-4444-4444-4444-444444444444';
begin
  select id into strict v_stable from public.stables where name = 'Stadnina Pod Debem';

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
  join public.horses h on h.stable_id = v_stable
  where sd.stable_id = v_stable
    and sd.day < current_date
    and (h.name in ('Bella', 'Kasztan') or extract(isodow from sd.day) in (6, 7));

  -- Aktywne zapisy w minionych godzinach = jazdy.
  insert into public.bookings (schedule_day_id, horse_id, hour, rider_id)
  select sdh.schedule_day_id,
         sdh.horse_id,
         hr::smallint,
         case when (extract(doy from sd.day)::int + hr + sdh.horse_id) % 3 = 0 then v_piotr else v_anna end
  from public.schedule_day_horses sdh
  join public.schedule_days sd on sd.id = sdh.schedule_day_id
  cross join generate_series(10, 15) as hr
  where sd.stable_id = v_stable
    and sd.day between current_date - 24 and current_date - 1
    and (extract(doy from sd.day)::int * 7 + hr * 3 + sdh.horse_id * 5) % 4 < 2;

  insert into public.bookings (schedule_day_id, horse_id, hour, rider_id, status, cancelled_at)
  select sdh.schedule_day_id,
         sdh.horse_id,
         hr::smallint,
         v_piotr,
         'cancelled',
         sd.day - interval '1 day'
  from public.schedule_day_horses sdh
  join public.schedule_days sd on sd.id = sdh.schedule_day_id
  cross join generate_series(10, 15) as hr
  where sd.stable_id = v_stable
    and sd.day between current_date - 24 and current_date - 1
    and (extract(doy from sd.day)::int * 7 + hr * 3 + sdh.horse_id * 5) % 4 = 3
    and (extract(doy from sd.day)::int + hr) % 5 = 0;

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
       count(*) filter (where b.rider_id is null) as bez_jezdzca
from public.bookings b
join public.schedule_days sd on sd.id = b.schedule_day_id
join public.stables s on s.id = sd.stable_id
where s.name = 'Stadnina Pod Debem' and sd.day < current_date;
