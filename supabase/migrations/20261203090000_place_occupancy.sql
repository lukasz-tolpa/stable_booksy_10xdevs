-- Zajetosc placow (#116, spec #112, GLOSSARY „Zajetosc placow”, ADR 0005).
--
-- Pensjonariusz i osrodek widza dla dnia osrodka, ile miejsc jest zajetych na kazdym placu w kazdej godzinie,
-- z instruktorem i rodzajem slotu - bez jezdzcow i koni. Wzor: public.get_slot_occupancy (same liczby,
-- security definer swiadomie omija RLS bookings).
--
-- Dostep:
--   * wlasciciel osrodka (private.owned_stable_id()),
--   * pensjonariusz osrodka, ktorego kon ma w tym osrodku pobyt obejmujacy dzien
--     (private.boarder_horses_on_day, #115).
-- Kazdy inny (jezdziec rekreacyjny, instruktor bez praw wlasciciela, inny osrodek, pensjonariusz innego
-- osrodka albo w dniu poza pobytem) - odmowa SB054. Komunikat po polsku: src/lib/place-occupancy/errors.ts.
--
-- Slot bez miejsc i bez aktywnych zapisow nie jest zajetoscia placu (save_schedule_day zapisuje pelna siatke
-- godzin z limitem 0) - funkcja go pomija, wiec pusta godzina zostaje pusta.

create function public.get_place_occupancy(p_stable_id bigint, p_day date)
returns table (
  place_id bigint,
  hour smallint,
  instructor_id bigint,
  instructor_name text,
  kind text,
  taken int
)
language plpgsql
stable
-- SECURITY DEFINER celowo: zapisy innych jezdzcow i pobyty koni sa zamkniete RLS; funkcja oddaje z nich
-- wylacznie liczby.
security definer
set search_path = ''
as $$
begin
  if p_stable_id is distinct from private.owned_stable_id()
     and not exists (select 1 from private.boarder_horses_on_day(auth.uid(), p_stable_id, p_day)) then
    raise exception 'Zajetosc placow widzi osrodek i pensjonariusz, ktorego kon stoi w osrodku w tym dniu'
      using errcode = 'SB054';
  end if;

  return query
  select sl.place_id,
         sl.hour,
         sl.instructor_id,
         i.name,
         sl.kind,
         (select count(*)::int
          from public.bookings b
          where b.schedule_day_id = sl.schedule_day_id
            and b.instructor_id = sl.instructor_id
            and b.hour = sl.hour
            and b.status = 'active') as taken
  from public.schedule_days sd
  join public.schedule_slots sl on sl.schedule_day_id = sd.id
  join public.instructors i on i.id = sl.instructor_id
  where sd.stable_id = p_stable_id
    and sd.day = p_day
    and (
      sl.seats > 0
      or exists (
        select 1 from public.bookings b
        where b.schedule_day_id = sl.schedule_day_id
          and b.instructor_id = sl.instructor_id
          and b.hour = sl.hour
          and b.status = 'active'
      )
    );
end;
$$;

comment on function public.get_place_occupancy(bigint, date) is
  'Zajetosc placow dnia osrodka (#116): plac x godzina x instruktor - liczba aktywnych zapisow, instruktor i rodzaj slotu, bez jezdzcow i koni. Tylko wlasciciel osrodka i pensjonariusz z pobytem konia obejmujacym dzien; inaczej SB054.';

revoke execute on function public.get_place_occupancy(bigint, date) from public, anon;
grant execute on function public.get_place_occupancy(bigint, date) to authenticated;
