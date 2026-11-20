-- Podsumowanie miesiaca instruktora z kontem (#90, spec #87, GLOSSARY "Podsumowanie miesiaca").
--
-- Jedyna zmiana schematu w spec #87: funkcja odczytu, bez nowych tabel, kolumn i polityk.
-- public.get_my_month_bookings(from, to) jest jak public.get_my_slot_bookings(from):
--   * instruktor z sesji (private.current_instructor_id()), nigdy z argumentu - jezdziec, konto
--     bez osrodka i instruktor zdezaktywowany dostaja zero wierszy,
--   * security definer, bo instruktor nie czyta profili jezdzcow ani koni wprost,
--   * tylko AKTYWNE zapisy na jego sloty; co jest jazda (slot sie skonczyl), decyduje aplikacja
--     (isRide w src/lib/bookings/rides.ts - ta sama regula co w Statystykach),
-- ale z zakresem dat (od, do - wlacznie) i z kluczem jezdzca: dwoch jezdzcow o tej samej nazwie
-- albo kilku bez nazwy nie zlewa sie w jeden wiersz podsumowania. Kluczem jest konto jezdzca
-- (bookings.rider_id) - instruktor i tak czyta je przy aktywnych zapisach na swoje sloty
-- (polityka bookings_select_own_or_my_stable), wiec funkcja nie odslania niczego nowego.
-- Jezdziec zanonimizowany (ADR-0001): brak klucza i anonymised = true.
--
-- Dowod: supabase/tests/instructor_month_summary.sql.

create function public.get_my_month_bookings(p_from date, p_to date)
returns table (
  day date,
  hour smallint,
  rider_key uuid,
  rider_name text,
  horse_name text,
  anonymised boolean
)
language sql
stable
-- SECURITY DEFINER celowo: instruktor nie czyta profili jezdzcow ani koni wprost. Funkcja
-- bierze instruktora z sesji (nigdy z argumentu) i zwraca wylacznie aktywne zapisy na jego sloty.
security definer
set search_path = ''
as $$
  select sd.day, b.hour, b.rider_id, p.full_name, h.name, b.rider_id is null
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
  'Aktywne zapisy na sloty zalogowanego instruktora w dniach p_from..p_to (wlacznie) dla Podsumowania miesiaca (#90): dzien, godzina, klucz jezdzca (konto; NULL i anonymised - jezdziec zanonimizowany), imie i nazwisko (NULL - bez nazwiska), przydzielony kon (NULL - bez konia). Instruktor z private.current_instructor_id(): jezdziec, konto bez osrodka i instruktor zdezaktywowany dostaja zero wierszy.';

revoke execute on function public.get_my_month_bookings(date, date) from public, anon;
grant execute on function public.get_my_month_bookings(date, date) to authenticated;
