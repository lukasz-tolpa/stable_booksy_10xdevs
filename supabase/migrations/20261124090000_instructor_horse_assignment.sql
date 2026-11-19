-- Przydzial konia przez instruktora (#81, spec #77, GLOSSARY "Przydzial konia", ADR-0002).
--
-- Kazdy aktywny instruktor z kontem przydziela, zmienia i zdejmuje konia przy aktywnym zapisie
-- na SWOJ slot - bez wzgledu na uprawnienie do ukladania grafiku i bez progu czasu, jak wlasciciel.
-- Przydzial jest jeden, bez autora: wlasciciel zmienia przydzial instruktora i odwrotnie.
--
--   * wyzwalacz bookings_horse_assignment dopuszcza zmiane horse_id przez wlasciciela albo przez
--     aktywnego instruktora, do ktorego slotu nalezy zapis; inne przypadki 42501,
--   * sciezka instruktora to public.assign_my_slot_horse(booking, horse) - security definer, pisze
--     wylacznie horse_id, wiec instruktor nie zmienia w zapisie niczego innego; polityka
--     bookings_update_own_or_my_stable zostaje bez zmian (bezposredni UPDATE instruktora: 0 wierszy),
--   * reguly konia bez zmian: kon z dnia (FK bookings_assigned_horse_fkey, 23503), jeden aktywny
--     zapis konia w godzinie (bookings_horse_hour_key, 23505), kon tylko przy zapisie aktywnym (23514),
--   * public.get_my_slot_horse_options(from) - konie pracujace dnia dla kazdego aktywnego zapisu
--     na moj slot ze znacznikiem "zajety o tej godzinie" (przydzielony innemu aktywnemu zapisowi,
--     takze na slocie innego instruktora), bez danych jezdzca ani instruktora zajmujacego konia,
--   * public.get_my_slot_bookings zwraca dodatkowo identyfikator zapisu i przydzielonego konia.
--
-- Dowod: supabase/tests/instructor_horse_assignment.sql.

-- ---------------------------------------------------------------------------
-- 1. Regula przydzialu: wlasciciel albo instruktor slotu
-- ---------------------------------------------------------------------------

create or replace function public.enforce_booking_horse_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- auth.uid() NULL dla postgres (migracje, dane demo, testy) - wtedy przydzial jest dozwolony.
  -- Odwolanie czysci konia samo (bookings_cancellation odpala wczesniej - kolejnosc alfabetyczna),
  -- wiec jezdziec odwolujacy zapis z jawnym horse_id = null nie jest tu odrzucany.
  -- Wlasciciela do jego stadniny zawezaja polityki RLS; instruktor przychodzi przez
  -- assign_my_slot_horse (security definer, poza RLS), wiec tu decyduje instruktor zapisu.
  if new.horse_id is distinct from old.horse_id
     and new.status = 'active'
     and (select auth.uid()) is not null
     and not private.is_stable_owner()
     and old.instructor_id is distinct from private.current_instructor_id() then
    raise exception 'Konia do zapisu przydziela wlasciciel osrodka albo instruktor slotu' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_booking_horse_assignment() is
  'Przydzial konia (#42, #71, #81): horse_id zapisu aktywnego zmienia wlasciciel osrodka albo aktywny instruktor, do ktorego slotu nalezy zapis (42501 dla jezdzca i cudzego instruktora). Kon z dnia i jeden zapis konia w godzinie pilnuja FK bookings_assigned_horse_fkey i indeks bookings_horse_hour_key.';

-- ---------------------------------------------------------------------------
-- 2. Przydzial konia przez instruktora na jego slocie
-- ---------------------------------------------------------------------------

create function public.assign_my_slot_horse(p_booking_id bigint, p_horse_id bigint default null)
returns void
language plpgsql
-- SECURITY DEFINER celowo: instruktor nie ma polityki UPDATE na bookings. Funkcja bierze
-- instruktora z sesji (nigdy z argumentu) i zmienia wylacznie horse_id zapisu na jego slot.
security definer
set search_path = ''
as $$
declare
  v_instructor bigint := private.current_instructor_id();
  v_instructor_of_booking bigint;
  v_status text;
begin
  select b.instructor_id, b.status into v_instructor_of_booking, v_status
  from public.bookings b
  where b.id = p_booking_id
  for update;

  -- Nieistniejacy zapis, cudzy slot, jezdziec i instruktor nieaktywny - jedna odmowa, bez
  -- zdradzania, czy zapis istnieje.
  if not found or v_instructor is null or v_instructor_of_booking is distinct from v_instructor then
    raise exception 'Konia przydzielasz tylko przy zapisach na swoje sloty' using errcode = '42501';
  end if;

  if v_status <> 'active' then
    raise exception 'Konia przydziela sie tylko do aktywnego zapisu' using errcode = '23514';
  end if;

  update public.bookings set horse_id = p_horse_id where id = p_booking_id;
end;
$$;

comment on function public.assign_my_slot_horse(bigint, bigint) is
  'Przydzial, zmiana albo zdjecie (p_horse_id NULL) konia przez instruktora przy aktywnym zapisie na jego slot (#81). Odmowy: 42501 zapis spoza slotow wywolujacego (takze jezdziec, instruktor nieaktywny, nieistniejacy zapis), 23514 zapis odwolany, 23503 kon nie pracuje tego dnia, 23505 kon zajety o tej godzinie. Bez progu czasu.';

revoke execute on function public.assign_my_slot_horse(bigint, bigint) from public, anon;
grant execute on function public.assign_my_slot_horse(bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Konie do wyboru przy zapisach na moje sloty
-- ---------------------------------------------------------------------------

create function public.get_my_slot_horse_options(p_from date)
returns table (booking_id bigint, horse_id bigint, horse_name text, taken boolean)
language sql
stable
-- SECURITY DEFINER celowo: instruktor nie czyta koni ani zapisow innych instruktorow wprost.
-- Zwraca tylko znacznik zajetosci - bez jezdzca ani instruktora, ktory ma konia o tej godzinie.
security definer
set search_path = ''
as $$
  select b.id, h.id, h.name,
         exists (
           select 1
           from public.bookings o
           where o.schedule_day_id = b.schedule_day_id
             and o.hour = b.hour
             and o.horse_id = h.id
             and o.status = 'active'
             and o.id <> b.id
         )
  from public.bookings b
  join public.schedule_days sd on sd.id = b.schedule_day_id
  join public.schedule_day_horses sdh on sdh.schedule_day_id = b.schedule_day_id
  join public.horses h on h.id = sdh.horse_id
  where b.instructor_id = private.current_instructor_id()
    and b.status = 'active'
    and sd.day >= p_from
  order by sd.day, b.hour, b.id, h.name;
$$;

comment on function public.get_my_slot_horse_options(date) is
  'Konie do wyboru przy aktywnych zapisach na sloty zalogowanego instruktora od p_from (#81): dla kazdego zapisu konie pracujace tego dnia, taken = kon przydzielony innemu aktywnemu zapisowi o tej godzinie (takze na slocie innego instruktora). Bez danych jezdzca ani instruktora. Jezdziec, konto bez osrodka i instruktor nieaktywny dostaja zero wierszy.';

revoke execute on function public.get_my_slot_horse_options(date) from public, anon;
grant execute on function public.get_my_slot_horse_options(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Zapisani na moje sloty - z identyfikatorem zapisu i konia
-- ---------------------------------------------------------------------------

-- Zmiana typu wyniku wymaga DROP; cialo jak w 20261118090000 plus booking_id i horse_id.
drop function public.get_my_slot_bookings(date);

create function public.get_my_slot_bookings(p_from date)
returns table (
  booking_id bigint,
  day date,
  hour smallint,
  rider_name text,
  horse_id bigint,
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
  select b.id, sd.day, b.hour, p.full_name, b.horse_id, h.name, b.rider_id is null
  from public.bookings b
  join public.schedule_days sd on sd.id = b.schedule_day_id
  left join public.profiles p on p.id = b.rider_id
  left join public.horses h on h.id = b.horse_id
  where b.instructor_id = private.current_instructor_id()
    and b.status = 'active'
    and sd.day >= p_from
  order by sd.day, b.hour, p.full_name;
$$;

comment on function public.get_my_slot_bookings(date) is
  'Aktywne zapisy na sloty zalogowanego instruktora od p_from: zapis, dzien, godzina, imie i nazwisko jezdzca (NULL - bez nazwiska albo zanonimizowany, wtedy anonymised), przydzielony kon (NULL - bez konia). Instruktor z private.current_instructor_id(): jezdziec, konto bez osrodka i instruktor zdezaktywowany dostaja zero wierszy (#72, #81).';

revoke execute on function public.get_my_slot_bookings(date) from public, anon;
grant execute on function public.get_my_slot_bookings(date) to authenticated;
