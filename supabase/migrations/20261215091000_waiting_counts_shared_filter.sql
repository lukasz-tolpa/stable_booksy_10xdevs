-- Liczby zapisow oczekujacych z jednej reguly (przeglad spec #122; #128, ADR 0006).
--
--   1. private.bookings_awaiting_decision() - jedyny filtr „zapis czeka na decyzje wolajacego”: zapis oczekujacy,
--      ktorego slot sie nie zaczal (private.booking_slot_started - dzien miniony tez sie zaczal, wiec osobny warunek
--      day >= warsaw_today() byl zbedny), na slocie, o ktorym wolajacy decyduje (private.decides_on_slot, #126).
--      Czytaja go public.count_pending_bookings (licznik) i public.get_pending_bookings (lista) - licznik liczy
--      dokladnie wiersze listy. Lista nie oddaje juz wygaslych zapisow dzisiejszych (TS i tak je odfiltrowywal).
--   2. public.get_slot_occupancy: kto widzi liczbe czekajacych, decyduje tylko baza. Wolajacy, ktory ja widzi, dostaje
--      wiersz kazdego slotu dnia w swoim zakresie - takze slotu bez zadnego zapisu (waiting = 0) - wiec aplikacja
--      pokazuje to, co dostala (brak wiersza albo NULL = liczba niewidoczna), bez wlasnej reguly widocznosci.
--      Pozostali wolajacy - jak dotad: wiersz tylko slotu z zapisem aktywnym, waiting NULL.
-- Kody: brak nowych. Dowod: supabase/tests/waiting_counts.sql.

-- ---------------------------------------------------------------------------
-- 1. Jeden filtr zapisow czekajacych na decyzje
-- ---------------------------------------------------------------------------

create function private.bookings_awaiting_decision()
returns table (booking_id bigint)
language sql
stable
set search_path = ''
as $$
  select b.id
  from public.bookings b
  join public.schedule_days sd on sd.id = b.schedule_day_id
  where b.status = 'pending'
    and not private.booking_slot_started(sd.day, b.hour)
    -- Ta sama regula „kto decyduje o zapisie” co przyjecie i odrzucenie (#126).
    and private.decides_on_slot(sd.stable_id, b.instructor_id);
$$;

comment on function private.bookings_awaiting_decision() is
  'Zapisy oczekujace, ktorych slot sie nie zaczal, na slotach, o ktorych decyduje wolajacy (private.decides_on_slot) - jedyny filtr licznika (count_pending_bookings) i listy (get_pending_bookings) zapisow do przyjecia. Wolany z funkcji security definer.';

revoke execute on function private.bookings_awaiting_decision() from public, anon, authenticated;

create or replace function public.count_pending_bookings()
returns int
language sql
stable
-- SECURITY DEFINER celowo: instruktor bez praw wlasciciela nie czyta przez RLS zapisow oczekujacych, a licznik
-- dostaje tylko liczbe. Zakres bierze z sesji (osrodek wlasciciela, instruktor konta), nigdy z argumentu.
security definer
set search_path = ''
as $$
  select count(*)::int from private.bookings_awaiting_decision();
$$;

comment on function public.count_pending_bookings() is
  'Licznik zapisow do przyjecia (#128): liczba wierszy get_pending_bookings - zapisy oczekujace, ktorych slot sie nie zaczal, wlasciciel w calym swoim osrodku, instruktor z kontem na swoich slotach (private.bookings_awaiting_decision); inne konta 0.';

create or replace function public.get_pending_bookings()
returns table (
  booking_id bigint,
  day date,
  hour smallint,
  instructor_id bigint,
  instructor_name text,
  place_name text,
  kind text,
  seats int,
  taken int,
  rider_id uuid,
  rider_name text,
  rider_email text,
  created_at timestamptz,
  rejected_before boolean
)
language sql
stable
-- SECURITY DEFINER celowo: imie i adres jezdzca z samym zapisem oczekujacym (nie jest „jezdzcem osrodka”,
-- RLS profili go nie odda) i liczba zajetych miejsc slotu. Wlasciciel - caly osrodek, instruktor - swoje sloty;
-- inne konto - zero wierszy.
security definer
set search_path = ''
as $$
  select b.id, sd.day, b.hour, b.instructor_id, i.name, pl.name, coalesce(s.kind, 'recreation'),
         coalesce(s.seats, 0)::int,
         (select count(*)::int
          from public.bookings a
          where a.schedule_day_id = b.schedule_day_id
            and a.instructor_id = b.instructor_id
            and a.hour = b.hour
            and a.status = 'active'),
         b.rider_id, p.full_name, u.email::text, b.created_at,
         -- Osrodek odrzucil juz recznie temu jezdzcowi zapis na ten slot („Brak miejsc” to nie jego decyzja).
         exists (
           select 1 from public.bookings r
           where r.schedule_day_id = b.schedule_day_id
             and r.instructor_id = b.instructor_id
             and r.hour = b.hour
             and r.rider_id = b.rider_id
             and r.status = 'rejected'
             and r.rejection_source = 'stable'
         )
  from private.bookings_awaiting_decision() w
  join public.bookings b on b.id = w.booking_id
  join public.schedule_days sd on sd.id = b.schedule_day_id
  join public.instructors i on i.id = b.instructor_id
  left join public.schedule_slots s
    on s.schedule_day_id = b.schedule_day_id and s.instructor_id = b.instructor_id and s.hour = b.hour
  left join public.places pl on pl.id = s.place_id
  left join public.profiles p on p.id = b.rider_id
  left join auth.users u on u.id = b.rider_id
  order by sd.day, b.hour, b.created_at, b.id;
$$;

comment on function public.get_pending_bookings() is
  'Zapisy do przyjecia (#124, #125, #126): zapisy czekajace na decyzje wolajacego (private.bookings_awaiting_decision - oczekujace, slot sie nie zaczal; wlasciciel: caly osrodek, instruktor z kontem: jego sloty) - najblizsze terminy pierwsze, z jezdzcem (imie i nazwisko, adres e-mail), slotem (instruktor, plac, rodzaj, limit), liczba aktywnych zapisow slotu i znacznikiem rejected_before (osrodek odrzucil juz recznie temu jezdzcowi zapis na ten slot). Inne konta: zero wierszy.';

-- ---------------------------------------------------------------------------
-- 2. Zajetosc slotow: widocznosc liczby czekajacych tylko w bazie
-- ---------------------------------------------------------------------------

create or replace function public.get_slot_occupancy(p_stable_id bigint, p_day date)
returns table (instructor_id bigint, hour smallint, taken int, waiting int)
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select
      coalesce(p_stable_id = private.owned_stable_id(), false)
        or coalesce(p_stable_id = private.schedule_stable_id(), false) as stable_side,
      private.current_instructor_id() as instructor_id,
      private.is_boarder_in_month((select auth.uid()), p_stable_id, date_trunc('month', p_day)::date) as boarder
  ),
  -- Sloty dnia w zakresie wolajacego (katalog: caly osrodek; instruktor bez praw wlasciciela: swoje sloty).
  day_slots as (
    select s.instructor_id, s.hour, s.kind
    from public.schedule_slots s
    join public.schedule_days sd on sd.id = s.schedule_day_id
    cross join caller c
    where sd.stable_id = p_stable_id
      and sd.day = p_day
      and (private.reads_catalogue() or c.stable_side or s.instructor_id = c.instructor_id)
  ),
  counts as (
    select b.instructor_id,
           b.hour,
           (count(*) filter (where b.status = 'active'))::int as taken,
           (count(*) filter (
             where b.status = 'pending' and not private.booking_slot_started(sd.day, b.hour)
           ))::int as pending
    from public.bookings b
    join public.schedule_days sd on sd.id = b.schedule_day_id
    cross join caller c
    where sd.stable_id = p_stable_id
      and sd.day = p_day
      and b.status in ('active', 'pending')
      and (private.reads_catalogue() or c.stable_side or b.instructor_id = c.instructor_id)
    group by b.instructor_id, b.hour
  ),
  slots as (
    select coalesce(k.instructor_id, n.instructor_id) as instructor_id,
           coalesce(k.hour, n.hour) as hour,
           coalesce(n.taken, 0) as taken,
           coalesce(n.pending, 0) as pending,
           -- Jedyna regula „kto widzi liczbe czekajacych”: osrodek (wlasciciel, instruktor ukladajacy grafik),
           -- instruktor na swoim slocie, pensjonariusz w miesiacu dnia przy slocie treningowym.
           (c.stable_side
             or coalesce(k.instructor_id, n.instructor_id) is not distinct from c.instructor_id
             or (c.boarder and k.kind = 'training')) as sees_waiting
    from day_slots k
    full join counts n on n.instructor_id = k.instructor_id and n.hour = k.hour
    cross join caller c
  )
  select instructor_id, hour, taken, case when sees_waiting then pending end
  from slots
  -- Wiersz bez zapisu aktywnego tylko dla tego, kto liczbe czekajacych widzi - inaczej sam wiersz z taken = 0
  -- zdradzalby, ze ktos czeka.
  where taken > 0 or sees_waiting;
$$;

comment on function public.get_slot_occupancy(bigint, date) is
  'Zajetosc slotow (instruktor x godzina) osrodka w danym dniu: taken - zapisy aktywne, waiting - zapisy oczekujace bez wygaslych (#128, ADR 0006). waiting widzi osrodek (wlasciciel, instruktor ukladajacy grafik, instruktor na swoim slocie) i pensjonariusz przy slotach treningowych - dostaje wtedy wiersz kazdego slotu dnia, takze bez zapisow (waiting 0); inaczej waiting NULL, a wiersz ma tylko slot z zapisem aktywnym. Aplikacja pokazuje waiting tak, jak go dostala. Security definer: same liczby, bez tozsamosci jezdzcow. Instruktor bez praw wlasciciela dostaje tylko swoje sloty (#72), z uprawnieniem do ukladania grafiku - wszystkie sloty swojego osrodka (#79).';
