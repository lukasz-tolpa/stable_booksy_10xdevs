-- Podsumowanie miesiaca instruktora w dwoch sekcjach (#118, spec #112, GLOSSARY "Pensjonariusz").
--
-- public.get_my_month_bookings(from, to) (#90) dostaje kolumne boarder: jezdziec jest pensjonariuszem
-- osrodka w miesiacu dnia jazdy - regula "pensjonariusz w miesiacu" z jednego zrodla w bazie
-- (private.is_boarder_in_month, #114). Instruktor nie czyta pobytow ani wlascicieli koni (RLS), wiec
-- podzial jezdzcow na "Rekreacje" i "Pensjonariuszy" bierze z tej kolumny; o pobytach nie dowiaduje sie
-- niczego poza tym jednym znacznikiem przy zapisie na jego slot (pensjonariusza i jego konia i tak widzi
-- przy slocie treningowym, #115). Jezdziec zanonimizowany: boarder = false (bez konta nie ma reguly).
--
-- Zmiana typu wyniku wymaga drop + create (create or replace nie zmienia kolumn wyniku). Reszta funkcji
-- bez zmian: instruktor z sesji, security definer, tylko aktywne zapisy na jego sloty w zakresie dat.
--
-- Bez kodow odmow. Dowod: supabase/tests/instructor_month_summary.sql.

drop function public.get_my_month_bookings(date, date);

create function public.get_my_month_bookings(p_from date, p_to date)
returns table (
  day date,
  hour smallint,
  rider_key uuid,
  rider_name text,
  horse_name text,
  anonymised boolean,
  boarder boolean
)
language sql
stable
-- SECURITY DEFINER celowo: instruktor nie czyta profili jezdzcow, koni ani pobytow wprost. Funkcja
-- bierze instruktora z sesji (nigdy z argumentu) i zwraca wylacznie aktywne zapisy na jego sloty.
security definer
set search_path = ''
as $$
  select sd.day, b.hour, b.rider_id, p.full_name, h.name, b.rider_id is null,
         b.rider_id is not null and private.is_boarder_in_month(b.rider_id, sd.stable_id, sd.day)
  from public.bookings b
  join public.schedule_days sd on sd.id = b.schedule_day_id
  left join public.profiles p on p.id = b.rider_id
  left join public.horses h on h.id = b.horse_id
  where b.instructor_id = private.current_instructor_id()
    and b.status = 'active'
    and sd.day between p_from and p_to
  order by sd.day, b.hour, p.full_name;
$$;

comment on function public.get_my_month_bookings(date, date) is
  'Aktywne zapisy na sloty zalogowanego instruktora w dniach p_from..p_to (wlacznie) dla Podsumowania miesiaca (#90): dzien, godzina, klucz jezdzca (konto; NULL i anonymised - jezdziec zanonimizowany), imie i nazwisko (NULL - bez nazwiska), przydzielony kon (NULL - bez konia), boarder - jezdziec jest pensjonariuszem osrodka w miesiacu dnia jazdy (#118, private.is_boarder_in_month). Instruktor z private.current_instructor_id(): jezdziec, konto bez osrodka i instruktor zdezaktywowany dostaja zero wierszy.';

revoke execute on function public.get_my_month_bookings(date, date) from public, anon;
grant execute on function public.get_my_month_bookings(date, date) to authenticated;
