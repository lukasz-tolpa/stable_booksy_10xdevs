-- Liczby zapisow oczekujacych (#128, spec #122, ADR 0006, GLOSSARY „Zapis oczekujacy”).
--
--   1. public.count_pending_bookings() - licznik zapisow do przyjecia w panelu i w nawigacji: wlasciciel liczy
--      caly osrodek, instruktor z kontem - swoje sloty. Liczy zapisy oczekujace, ktorych slot sie nie zaczal
--      (wygasle nie czekaja na decyzje).
--   2. public.get_slot_occupancy(stable, day) dostaje kolumne waiting - liczbe zapisow oczekujacych slotu
--      (bez wygaslych). Widza ja: osrodek zawsze (wlasciciel, instruktor ukladajacy grafik, instruktor na swoim
--      slocie), pensjonariusz w miesiacu dnia przy slotach treningowych; inni (jezdziec rekreacyjny, slot
--      rekreacyjny u pensjonariusza) dostaja NULL. Wiersz slotu z samymi zapisami oczekujacymi zwraca sie tylko
--      temu, kto liczbe czekajacych widzi - inaczej sam wiersz z taken = 0 zdradzalby, ze ktos czeka.
--      taken bez zmian: tylko zapisy aktywne.
-- Kody: brak nowych (zakres SB080-SB081 niewykorzystany).
-- Dowod: supabase/tests/waiting_counts.sql.

-- ---------------------------------------------------------------------------
-- 1. Licznik zapisow do przyjecia
-- ---------------------------------------------------------------------------

create function public.count_pending_bookings()
returns int
language sql
stable
-- SECURITY DEFINER celowo: instruktor bez praw wlasciciela nie czyta przez RLS zapisow oczekujacych, a licznik
-- dostaje tylko liczbe. Zakres bierze z sesji (osrodek wlasciciela, instruktor konta), nigdy z argumentu.
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.bookings b
  join public.schedule_days sd on sd.id = b.schedule_day_id
  where b.status = 'pending'
    and sd.day >= private.warsaw_today()
    and not private.booking_slot_started(sd.day, b.hour)
    and (
      sd.stable_id = private.owned_stable_id()
      or b.instructor_id = private.current_instructor_id()
    );
$$;

comment on function public.count_pending_bookings() is
  'Licznik zapisow do przyjecia (#128): zapisy oczekujace, ktorych slot sie nie zaczal - wlasciciel w calym swoim osrodku, instruktor z kontem na swoich slotach; inne konta 0.';

revoke execute on function public.count_pending_bookings() from public, anon;
grant execute on function public.count_pending_bookings() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Zajetosc slotow z liczba czekajacych
-- ---------------------------------------------------------------------------

drop function public.get_slot_occupancy(bigint, date);

create function public.get_slot_occupancy(p_stable_id bigint, p_day date)
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
  slots as (
    select b.instructor_id,
           b.hour,
           (count(*) filter (where b.status = 'active'))::int as taken,
           (count(*) filter (
             where b.status = 'pending' and not private.booking_slot_started(sd.day, b.hour)
           ))::int as pending,
           (c.stable_side
             or b.instructor_id is not distinct from c.instructor_id
             or (c.boarder and s.kind = 'training')) as sees_waiting
    from public.bookings b
    join public.schedule_days sd on sd.id = b.schedule_day_id
    cross join caller c
    left join public.schedule_slots s
      on s.schedule_day_id = b.schedule_day_id and s.instructor_id = b.instructor_id and s.hour = b.hour
    where sd.stable_id = p_stable_id
      and sd.day = p_day
      and b.status in ('active', 'pending')
      and (
        private.reads_catalogue()
        or c.stable_side
        or b.instructor_id = c.instructor_id
      )
    group by b.instructor_id, b.hour, s.kind, c.stable_side, c.instructor_id, c.boarder
  )
  select instructor_id, hour, taken, case when sees_waiting then pending end
  from slots
  where taken > 0 or sees_waiting;
$$;

comment on function public.get_slot_occupancy(bigint, date) is
  'Zajetosc slotow (instruktor x godzina) osrodka w danym dniu: taken - zapisy aktywne, waiting - zapisy oczekujace bez wygaslych (#128, ADR 0006). waiting widzi osrodek (wlasciciel, instruktor ukladajacy grafik, instruktor na swoim slocie) i pensjonariusz przy slotach treningowych; inaczej NULL, a slot z samymi zapisami oczekujacymi nie ma wiersza. Security definer: same liczby, bez tozsamosci jezdzcow. Instruktor bez praw wlasciciela dostaje tylko swoje sloty (#72), z uprawnieniem do ukladania grafiku - wszystkie sloty swojego osrodka (#79).';

revoke execute on function public.get_slot_occupancy(bigint, date) from public, anon;
grant execute on function public.get_slot_occupancy(bigint, date) to authenticated;
