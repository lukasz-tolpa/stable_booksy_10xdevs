-- Poprawki z przegladu spec #112 (pensjonariusze, konie pensjonatowe, sloty treningowe).
--
--   1. public.get_stable_boarding_horses() zwraca tez konie bez zadnego pobytu (kolumny pobytu NULL):
--      po usunieciu konta pensjonariusza pobyt, ktory sie nie zaczal, znika (#120), a osrodek dalej
--      widzi konia bez wlasciciela (spec: „Ośrodek widzi konia bez właściciela z zakończonym pobytem”).
--   2. Zapis na slot treningowy zawsze ma konia pensjonariusza: UPDATE zostawiajacy horse_id NULL na
--      aktywnym zapisie na slot treningowy - odmowa SB063 (wlasciciel i instruktor slotu). Odwolanie
--      czysci konia jak dotad (zapis nieaktywny regula pomija).
--   3. Funkcje wyzwalaczy public.enforce_working_horse_is_stable_horse() i
--      public.enforce_horse_kind_immutable() bez prawa wykonania dla public/anon/authenticated - jak
--      kazda inna public.enforce_*.
--
-- Kody: SB063 (nastepny wolny: SB064).
-- Dowod: supabase/tests/training_slots.sql (SB063, prawa wykonania),
--        supabase/tests/boarder_account_deletion.sql (kon bez pobytu na liscie osrodka).

-- ---------------------------------------------------------------------------
-- 1. Lista koni pensjonatowych osrodka - takze konie bez pobytu
-- ---------------------------------------------------------------------------

create or replace function public.get_stable_boarding_horses()
returns table (
  horse_id bigint,
  horse_name text,
  rider_id uuid,
  rider_name text,
  rider_email text,
  stay_id bigint,
  arrival_day date,
  departure_day date,
  departure_set_by text
)
language sql
stable
-- SECURITY DEFINER celowo: nazwisko i adres pensjonariusza, ktorego kon jeszcze nie przyjechal
-- (profil wlasciciel czyta dopiero od dnia przyjazdu), i adres e-mail z auth.users. Tylko konie
-- pensjonatowe osrodka wlasciciela; inne konto dostaje zero wierszy.
security definer
set search_path = ''
as $$
  select h.id, h.name, o.rider_id, p.full_name, u.email::text,
         s.id, s.arrival_day, s.departure_day, s.departure_set_by
  from public.horse_owners o
  join public.horses h on h.id = o.horse_id
  left join public.horse_stays s on s.horse_id = o.horse_id
  left join public.profiles p on p.id = o.rider_id
  left join auth.users u on u.id = o.rider_id
  where o.stable_id = private.owned_stable_id()
  order by p.full_name nulls last, o.rider_id, h.name, h.id, s.arrival_day desc;
$$;

comment on function public.get_stable_boarding_horses() is
  'Konie pensjonatowe osrodka wlasciciela z pensjonariuszem (nazwisko, adres e-mail; NULL - konto usuniete) i pobytami, jeden wiersz na pobyt, najnowszy pobyt pierwszy; kon bez pobytu - jeden wiersz z kolumnami pobytu NULL (#112). Inne konta: zero wierszy.';

-- ---------------------------------------------------------------------------
-- 2. Zapis na slot treningowy zawsze z koniem pensjonariusza (SB063)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_booking_slot_rules()
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

  -- #112: aktywny zapis na slot treningowy nie zostaje bez konia - przydzial zmienia sie tylko na innego
  -- konia pensjonariusza (ponizej, SB051).
  if tg_op = 'UPDATE' and v_kind = 'training' and new.horse_id is null then
    raise exception 'Zapis na slot treningowy zawsze ma konia pensjonariusza' using errcode = 'SB063';
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
  'Zapis i kon wobec rodzaju slotu (#115): pensjonariusz w miesiacu nie na slot rekreacyjny (SB049), nie-pensjonariusz nie na treningowy (SB050); slot treningowy - kon pensjonatowy zapisujacego z pobytem obejmujacym dzien (jedyny od razu; kilka bez wyboru SB052; zaden SB053; cudzy/osrodka/bez pobytu SB051; zdjecie konia z aktywnego zapisu SB063, #112); slot rekreacyjny - kon pracujacy dnia (23503 bookings_assigned_horse_fkey), jezdziec konia nie wybiera (42501).';

-- ---------------------------------------------------------------------------
-- 3. Funkcje wyzwalaczy bez prawa wykonania
-- ---------------------------------------------------------------------------

revoke execute on function public.enforce_working_horse_is_stable_horse() from public, anon, authenticated;
revoke execute on function public.enforce_horse_kind_immutable() from public, anon, authenticated;
