-- Migracja: ochrona zapisow przed zmiana grafiku (S-02, faza 1)
--
-- Domyka rozstrzygniecie Otwartego pytania #2 PRD (2026-08-11): zmiana grafiku
-- kolidujaca z aktywnym zapisem jest ODRZUCANA; zapisy nigdy nie sa kasowane ani
-- przenoszone przez edycje grafiku.
--
-- Regula ma cztery przypadki. Dwa byly juz pilnowane przez F-01:
--   * odpiecie konia od dnia, w ktorym ma zapis  -> ON DELETE RESTRICT (23503)
--   * usuniecie calego dnia z zapisami           -> kaskada do schedule_day_horses,
--                                                   ktora uderza w ten sam RESTRICT
-- Dwa pozostale nie byly pilnowane przez nic i to je dokladamy tutaj:
--   * zawezenie zakresu godzin ponizej istniejacego zapisu
--   * zmiana daty dnia, ktory ma aktywne zapisy
--
-- Trigger sprawdzajacy godzine przy zapisie wisi na `bookings` i odpala sie przy
-- INSERT/UPDATE zapisu - nie widzi wiec edycji samego grafiku. Stad osobny straznik
-- po stronie `schedule_days`.

-- ---------------------------------------------------------------------------
-- Funkcja straznika
-- ---------------------------------------------------------------------------

create or replace function public.enforce_schedule_change_keeps_bookings()
returns trigger
language plpgsql
-- SECURITY DEFINER celowo: straznik musi widziec WSZYSTKIE zapisy dnia, a nie tylko
-- te, ktore polityka odczytu pokazuje wolajacemu.
security definer
set search_path = ''
as $$
declare
  v_conflicts int;
begin
  -- Zmiana daty: kazdy aktywny zapis tego dnia wedrowalby na inny termin, a jezdziec
  -- nie dowiedzialby sie o tym. Blokujemy niezaleznie od godzin.
  if new.day is distinct from old.day then
    select count(*)
      into v_conflicts
    from public.bookings b
    where b.schedule_day_id = old.id
      and b.status = 'active';

    if v_conflicts > 0 then
      raise exception 'Nie mozna zmienic daty dnia: ma % aktywnych zapisow', v_conflicts
        using errcode = 'SB001';
    end if;
  end if;

  -- Zmiana godzin: blokujemy WYLACZNIE zmiany, po ktorych istniejacy aktywny zapis
  -- wypadlby poza zakres [open_hour, close_hour). Rozszerzenie dnia ma przechodzic -
  -- latwo o straznika, ktory blokuje kazda zmiane godzin przy jakichkolwiek zapisach.
  if new.open_hour is distinct from old.open_hour or new.close_hour is distinct from old.close_hour then
    select count(*)
      into v_conflicts
    from public.bookings b
    where b.schedule_day_id = old.id
      and b.status = 'active'
      and (b.hour < new.open_hour or b.hour >= new.close_hour);

    if v_conflicts > 0 then
      raise exception 'Nie mozna zawezic godzin pracy: % aktywnych zapisow wypadloby poza zakres', v_conflicts
        using errcode = 'SB002';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_schedule_change_keeps_bookings() is
  'Straznik decyzji z Otwartego pytania #2 PRD. Kody bledu: SB001 = zmiana daty dnia z zapisami, SB002 = zawezenie godzin pod zapisem. Odrozniaja sie od 23505 (dubel konia w slocie) i 23514 (godzina poza zakresem przy zapisie), bo prowadza do innego komunikatu i innej czynnosci osrodka.';

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------

-- Wylacznie UPDATE OF wymienionych kolumn. Bez tego straznik odpalalby sie takze przy
-- dotknieciu updated_at przez schedule_days_set_updated_at i wykonywal zapytanie o
-- zapisy przy kazdej zmianie czegokolwiek.
create trigger schedule_days_protect_bookings
before update of open_hour, close_hour, day on public.schedule_days
for each row execute function public.enforce_schedule_change_keeps_bookings();
