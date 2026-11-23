-- Zapis oczekujacy i przyjecie zapisu (#124, spec #122, ADR 0006, GLOSSARY „Zapis oczekujący”,
-- „Przyjęcie zapisu”, „Wygaśnięcie zapisu”). Pierwszy pelny przeplyw dwuetapowego zapisu: zapis jezdzca
-- czeka na przyjecie, wlasciciel przyjmuje go funkcja bazy.
--
--   1. Zapis jezdzca zawsze powstaje jako oczekujacy: wartosc domyslna kolumny 'pending', polityka INSERT
--      jezdzca tylko 'pending'. Seed i dane demo wstawiaja zapisy z jawnym stanem.
--   2. Jeden zapis oczekujacy albo aktywny jezdzca na godzine dnia: bookings_rider_hour_key obejmuje
--      oba stany (23505). CHECK bookings_horse_only_when_active_check dopuszcza konia przy zapisie
--      oczekujacym.
--   3. „Slot sie zaczal” w SQL: private.booking_slot_started (blizniak hasSlotStarted w
--      src/lib/bookings/slots.ts).
--   4. Reguly zapisu dzialaja przy zapisie oczekujacym (dotad wyzwalacze pomijaly zapis nieaktywny):
--      bookings_seat_limit - dzien i slot istnieja, godzina w zakresie, slot ma wolne miejsce (SB009);
--      miejsce zajmuje i liczy sie tylko zapis aktywny. bookings_slot_rules - rodzaj slotu wobec
--      pensjonariusza (SB049/SB050) i kon pensjonatowy przy slocie treningowym (przydzielony albo
--      wybrany przy zapisie, przechodzi na zapis aktywny). Przydzial konia przez osrodek - tylko zapis
--      aktywny (23514 z nazwa bookings_horse_only_when_active_check, jak dotad).
--   5. Maszyna stanow dla zapisow z aplikacji (wyzwalacz bookings_state_machine, tylko rola authenticated
--      - funkcje bazy i postgres pisza bez niego): jezdziec odwoluje swoj zapis oczekujacy albo aktywny,
--      osrodek odwoluje tylko aktywny; kazda inna zmiana stanu (np. jezdziec ustawia sobie 'active',
--      wlasciciel przyjmuje z pominieciem funkcji) - 42501. Zapis z aplikacji na slot, ktory sie zaczal -
--      SB064. Zapis odrzucony jest koncowy jak odwolany (bookings_cancellation, takze dla postgres).
--   6. Przyjecie: public.accept_booking(booking) - zapis oczekujacy w aktywny; ponad limit odmawia
--      bookings_seat_limit (blokada wiersza slotu - takze dwa rownoczesne przyjecia; SB009), slot znikl -
--      23503. Wolajacy: wlasciciel osrodka zapisu (instruktor z kontem - #126).
--   7. Zapisy do przyjecia: public.get_pending_bookings() - zapisy oczekujace osrodka wlasciciela od dzis,
--      z jezdzcem (imie i nazwisko, adres e-mail - jezdziec z samym zapisem oczekujacym nie jest
--      „jezdzcem osrodka”, wiec RLS profili go nie odda), slotem i zajetymi miejscami. Wygasniecie
--      (slot sie zaczal) wyprowadza odczyt w TS (`bookingStateAt`).
--
-- Usuniecie konta jezdzca (ADR 0001) kasuje wszystkie jego zapisy, ktorych slot sie nie skonczyl - takze
-- oczekujace (wyzwalacz profiles_release_future_bookings bez warunku na stan) - bez zmian.
--
-- Kody: SB064 slot sie zaczal (zapis, przyjecie), SB065 zapis nie jest oczekujacy, SB066 brak uprawnien
-- albo cudzy/nieistniejacy zapis. SB067-SB069 wolne (zakres #124). Komunikaty: src/lib/bookings/errors.ts
-- (jezdziec), src/lib/bookings/acceptance.ts (osrodek).
-- Dowod: supabase/tests/booking_acceptance.sql, concurrent_seat_booking.sh (wyscig przyjec).

-- ---------------------------------------------------------------------------
-- 1. Zapis jezdzca zawsze oczekujacy
-- ---------------------------------------------------------------------------

alter table public.bookings alter column status set default 'pending';

alter policy bookings_insert_own_as_rider on public.bookings
  with check (
    rider_id = (select auth.uid())
    and (select private.current_role()) = 'rider'
    and status = 'pending'
  );

-- ---------------------------------------------------------------------------
-- 2. Jeden zapis oczekujacy albo aktywny na godzine; kon przy zapisie oczekujacym
-- ---------------------------------------------------------------------------

drop index public.bookings_rider_hour_key;
create unique index bookings_rider_hour_key
  on public.bookings (schedule_day_id, hour, rider_id)
  where status in ('pending', 'active');

alter table public.bookings drop constraint bookings_horse_only_when_active_check;
alter table public.bookings add constraint bookings_horse_only_when_active_check
  check (status in ('pending', 'active') or horse_id is null);

comment on column public.bookings.horse_id is
  'Kon zapisu; NULL = jeszcze bez konia. Przy zapisie aktywnym i oczekujacym (kon pensjonatowy wybrany albo przydzielony przy zapisie na slot treningowy, #124). Slot rekreacyjny: kon osrodka pracujacy tego dnia; slot treningowy: kon pensjonatowy zapisanego pensjonariusza z pobytem obejmujacym dzien (wyzwalacz bookings_slot_rules, #115).';

-- ---------------------------------------------------------------------------
-- 3. „Slot sie zaczal”
-- ---------------------------------------------------------------------------

create function private.booking_slot_started(p_day date, p_hour smallint, p_at timestamptz default now())
returns boolean
language sql
stable
set search_path = ''
as $$
  -- Czas scienny w strefie osrodka: slot (dzien, godzina) zaczyna sie o godzina:00; trwajacy - zaczal sie.
  select p_day + make_interval(hours => p_hour) <= (p_at at time zone 'Europe/Warsaw');
$$;

comment on function private.booking_slot_started(date, smallint, timestamptz) is
  'Czy slot (dzien, godzina) juz sie zaczal wzgledem p_at, w strefie Europe/Warsaw - prog zapisu, przyjecia i wygasniecia zapisu oczekujacego. Blizniak hasSlotStarted w src/lib/bookings/slots.ts.';

revoke execute on function private.booking_slot_started(date, smallint, timestamptz) from public, anon, authenticated;

-- Wersja dla wyzwalacza z prawami wolajacego: dzien z wiersza grafiku bez zaleznosci od RLS.
create function private.schedule_slot_started(p_schedule_day_id bigint, p_hour smallint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.booking_slot_started(sd.day, p_hour)
  from public.schedule_days sd
  where sd.id = p_schedule_day_id;
$$;

comment on function private.schedule_slot_started(bigint, smallint) is
  'Czy slot dnia grafiku o godzinie juz sie zaczal (private.booking_slot_started); NULL - brak dnia.';

revoke execute on function private.schedule_slot_started(bigint, smallint) from public, anon;
grant execute on function private.schedule_slot_started(bigint, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- 4a. Limit miejsc i istnienie slotu - takze dla zapisu oczekujacego
-- ---------------------------------------------------------------------------

create or replace function public.enforce_booking_seat_limit()
returns trigger
language plpgsql
-- SECURITY DEFINER celowo: blokady i liczenie musza widziec wszystkie zapisy slotu, a jezdziec
-- nie ma uprawnien do blokowania wierszy grafiku.
security definer
set search_path = ''
as $$
declare
  v_open smallint;
  v_close smallint;
  v_seats smallint;
  v_taken int;
begin
  -- Odwolany i odrzucony zapis nie zajmuje miejsca i nie czeka na nie.
  if new.status not in ('pending', 'active') then
    return new;
  end if;

  -- FOR SHARE: czekamy na trwajacy zapis grafiku tego dnia i czytamy jego wynik.
  select sd.open_hour, sd.close_hour into v_open, v_close
  from public.schedule_days sd
  where sd.id = new.schedule_day_id
  for share;

  if not found then
    raise exception 'Grafik dnia o id % nie istnieje', new.schedule_day_id using errcode = '23503';
  end if;

  if new.hour < v_open or new.hour >= v_close then
    raise exception 'Godzina % jest poza zakresem pracy osrodka [%, %)', new.hour, v_open, v_close
      using errcode = '23514';
  end if;

  -- Zapis aktywny (wstawienie albo przyjecie): FOR UPDATE na slocie serializuje zajmowanie miejsc,
  -- takze dwa rownoczesne przyjecia. Zapis oczekujacy miejsca nie zajmuje - FOR SHARE czeka tylko na
  -- trwajace przyjecie, zeby nie stanac w kolejce do slotu, ktory wlasnie sie zapelnil.
  if new.status = 'active' then
    select s.seats into v_seats
    from public.schedule_slots s
    where s.schedule_day_id = new.schedule_day_id
      and s.instructor_id = new.instructor_id
      and s.hour = new.hour
    for update;
  else
    select s.seats into v_seats
    from public.schedule_slots s
    where s.schedule_day_id = new.schedule_day_id
      and s.instructor_id = new.instructor_id
      and s.hour = new.hour
    for share;
  end if;

  if not found then
    raise exception 'Instruktor % nie pracuje w dniu % o godzinie %', new.instructor_id, new.schedule_day_id, new.hour
      using errcode = '23503';
  end if;

  select count(*) into v_taken
  from public.bookings b
  where b.schedule_day_id = new.schedule_day_id
    and b.instructor_id = new.instructor_id
    and b.hour = new.hour
    and b.status = 'active'
    and b.id is distinct from new.id;

  if v_taken >= v_seats then
    raise exception 'Brak wolnych miejsc w slocie (limit %, zajete %)', v_seats, v_taken
      using errcode = 'SB009';
  end if;

  return new;
end;
$$;

comment on function public.enforce_booking_seat_limit() is
  'Limit miejsc slotu (#41, #124): zapis oczekujacy i aktywny wymaga dnia (FOR SHARE), godziny w zakresie i slotu z wolnym miejscem; miejsce zajmuje i liczy sie tylko zapis aktywny (FOR UPDATE na slocie - takze przy przyjeciu). Kody: SB009 brak miejsc, 23503 brak dnia/slotu, 23514 godzina poza zakresem.';

-- ---------------------------------------------------------------------------
-- 4b. Rodzaj slotu i kon - takze dla zapisu oczekujacego
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
  -- Odwolany i odrzucony zapis nie ma konia (bookings_cancellation odpala wczesniej i czysci konia).
  if new.status not in ('pending', 'active') then
    return new;
  end if;

  -- Przydzial konia przez osrodek dotyczy tylko zapisu aktywnego; zapis oczekujacy ma konia z zapisu
  -- (slot treningowy), przyjecie go zachowuje. Ten sam kod i nazwa co CHECK - aplikacja tlumaczy je jak dotad.
  if tg_op = 'UPDATE' and new.status = 'pending' and new.horse_id is distinct from old.horse_id then
    raise exception 'Konia przydziela sie tylko zapisowi aktywnemu'
      using errcode = '23514', constraint = 'bookings_horse_only_when_active_check';
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
  'Zapis i kon wobec rodzaju slotu (#115, #124 - takze zapis oczekujacy): pensjonariusz w miesiacu nie na slot rekreacyjny (SB049), nie-pensjonariusz nie na treningowy (SB050); slot treningowy - kon pensjonatowy zapisujacego z pobytem obejmujacym dzien (jedyny od razu; kilka bez wyboru SB052; zaden SB053; cudzy/osrodka/bez pobytu SB051; zdjecie konia z aktywnego zapisu SB063, #112); slot rekreacyjny - kon pracujacy dnia (23503 bookings_assigned_horse_fkey), jezdziec konia nie wybiera (42501); przydzial konia zapisowi oczekujacemu - 23514 bookings_horse_only_when_active_check.';

-- Kto zmienia konia: jak dotad wlasciciel albo instruktor slotu - takze przy zapisie oczekujacym, zeby
-- jezdziec dostal te sama odmowe (42501) niezaleznie od stanu swojego zapisu. Ze zapis oczekujacy w ogole
-- nie dostaje konia od osrodka, rozstrzyga bookings_slot_rules (23514).
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
     and new.status in ('pending', 'active')
     and (select auth.uid()) is not null
     and not private.is_stable_owner()
     and old.instructor_id is distinct from private.current_instructor_id() then
    raise exception 'Konia do zapisu przydziela wlasciciel osrodka albo instruktor slotu' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_booking_horse_assignment() is
  'Przydzial konia (#42, #71, #81, #124): horse_id zapisu aktywnego (i oczekujacego) zmienia wlasciciel osrodka albo aktywny instruktor, do ktorego slotu nalezy zapis (42501 dla jezdzca i cudzego instruktora). Ktory kon wolno przydzielic i ze tylko zapisowi aktywnemu, pilnuje bookings_slot_rules (#115, #124), jeden zapis konia w godzinie - indeks bookings_horse_hour_key.';

-- ---------------------------------------------------------------------------
-- 5a. Odwolany i odrzucony zapis jest koncowy
-- ---------------------------------------------------------------------------

create or replace function public.enforce_booking_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- NULL dla postgres (migracje, dane demo, testy) - wtedy pole ustawia piszacy.
  v_actor text := case private.current_role()
    when 'rider' then 'rider'
    when 'instructor' then 'stable'
  end;
begin
  if old.status in ('cancelled', 'rejected') then
    if new.status is distinct from old.status or new.cancelled_by is distinct from old.cancelled_by then
      raise exception 'Odwolanego ani odrzuconego zapisu nie mozna przywrocic ani zmienic'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status = 'cancelled' then
    -- Brak pola zostawiamy CHECK-owi spojnosci (23514) - tu tylko wpis innego podmiotu.
    if v_actor is not null and new.cancelled_by is not null and new.cancelled_by <> v_actor then
      raise exception 'Jako odwolujacego mozna wpisac wylacznie siebie (%)', v_actor
        using errcode = '42501';
    end if;
    -- Odwolanie zwalnia konia w tej godzinie.
    new.horse_id := null;
  end if;

  return new;
end;
$$;

comment on function public.enforce_booking_cancellation() is
  'Odwolanie zapisu (#41, #124): odwolujacy = rola wolajacego (rider/stable), przydzial konia czyszczony; odwolanego ani odrzuconego zapisu nie da sie przywrocic ani zmienic (42501). Spojnosc pola ze statusem pilnuje CHECK bookings_cancelled_by_consistency_check.';

-- ---------------------------------------------------------------------------
-- 5b. Maszyna stanow dla zapisow z aplikacji
-- ---------------------------------------------------------------------------

create function public.enforce_booking_state_machine()
returns trigger
language plpgsql
-- SECURITY INVOKER celowo: regula dotyczy wylacznie zapisow z aplikacji (rola authenticated). Funkcje
-- bazy (przyjecie, zapis grafiku) dzialaja jako wlasciciel i zmieniaja stan wedlug wlasnych regul; postgres
-- (seed, dane demo, testy) pisze bez ograniczen.
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Stan 'pending' wymusza polityka INSERT; tu prog czasu, dotad pilnowany tylko w endpoincie.
    if private.schedule_slot_started(new.schedule_day_id, new.hour) then
      raise exception 'Slot o godzinie % juz sie zaczal', new.hour using errcode = 'SB064';
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Jedyna zmiana stanu z aplikacji to odwolanie: jezdziec - oczekujacego albo aktywnego,
  -- osrodek - tylko aktywnego (zapis oczekujacy osrodek odrzuca). Przyjecie i odrzucenie to funkcje bazy.
  if new.status = 'cancelled'
     and (old.status = 'active' or (old.status = 'pending' and private.current_role() = 'rider')) then
    return new;
  end if;

  raise exception 'Niedozwolona zmiana stanu zapisu: % -> %', old.status, new.status
    using errcode = '42501';
end;
$$;

comment on function public.enforce_booking_state_machine() is
  'Maszyna stanow zapisu dla roli authenticated (#124): zapis z aplikacji na slot, ktory sie zaczal - SB064; zmiana stanu tylko przez odwolanie (jezdziec: oczekujacy albo aktywny, osrodek: aktywny), inne - 42501. Przyjecie: public.accept_booking.';

revoke execute on function public.enforce_booking_state_machine() from public, anon, authenticated;

create trigger bookings_state_machine
before insert or update of status on public.bookings
for each row execute function public.enforce_booking_state_machine();

-- ---------------------------------------------------------------------------
-- 6. Przyjecie zapisu
-- ---------------------------------------------------------------------------

create function public.accept_booking(p_booking_id bigint)
returns void
language plpgsql
-- SECURITY DEFINER celowo: zmiana stanu zapisu jest odebrana roli authenticated (bookings_state_machine);
-- osrodek bierzemy z sesji, nigdy z argumentu.
security definer
set search_path = ''
as $$
declare
  v_stable bigint := private.owned_stable_id();
  v_day_id bigint;
  v_day date;
  v_hour smallint;
  v_status text;
begin
  select b.schedule_day_id into v_day_id
  from public.bookings b
  join public.schedule_days sd on sd.id = b.schedule_day_id
  where b.id = p_booking_id
    and v_stable is not null
    and sd.stable_id = v_stable;

  if not found then
    raise exception 'Zapis % nie nalezy do osrodka wolajacego', p_booking_id using errcode = 'SB066';
  end if;

  -- Kolejnosc blokad jak w wyzwalaczu limitu i w save_schedule_day: dzien, potem zapis, potem slot
  -- (bookings_seat_limit przy UPDATE ponizej) - bez zakleszczen.
  select sd.day into v_day from public.schedule_days sd where sd.id = v_day_id for share;

  select b.status, b.hour into v_status, v_hour
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if v_status <> 'pending' then
    raise exception 'Zapis % nie jest oczekujacy (%)', p_booking_id, v_status using errcode = 'SB065';
  end if;

  if private.booking_slot_started(v_day, v_hour) then
    raise exception 'Slot zapisu % juz sie zaczal', p_booking_id using errcode = 'SB064';
  end if;

  -- Limit miejsc (SB009) i istnienie slotu (23503) - bookings_seat_limit; znacznik przyjecia -
  -- bookings_acceptance.
  update public.bookings set status = 'active' where id = p_booking_id;
end;
$$;

comment on function public.accept_booking(bigint) is
  'Przyjecie zapisu (#124, GLOSSARY „Przyjęcie zapisu”): zapis oczekujacy osrodka wolajacego staje sie aktywny i zajmuje miejsce. Odmowy: SB066 wolajacy nie jest wlascicielem osrodka zapisu (albo brak zapisu), SB065 zapis nie jest oczekujacy, SB064 slot sie zaczal, SB009 brak miejsc (takze przy rownoczesnych przyjeciach), 23503 slotu nie ma w grafiku.';

revoke execute on function public.accept_booking(bigint) from public, anon;
grant execute on function public.accept_booking(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Zapisy do przyjecia
-- ---------------------------------------------------------------------------

create function public.get_pending_bookings()
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
  created_at timestamptz
)
language sql
stable
-- SECURITY DEFINER celowo: imie i adres jezdzca z samym zapisem oczekujacym (nie jest „jezdzcem osrodka”,
-- RLS profili go nie odda) i liczba zajetych miejsc slotu. Tylko osrodek wlasciciela; inne konto - zero wierszy.
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
         b.rider_id, p.full_name, u.email::text, b.created_at
  from public.bookings b
  join public.schedule_days sd on sd.id = b.schedule_day_id
  join public.instructors i on i.id = b.instructor_id
  left join public.schedule_slots s
    on s.schedule_day_id = b.schedule_day_id and s.instructor_id = b.instructor_id and s.hour = b.hour
  left join public.places pl on pl.id = s.place_id
  left join public.profiles p on p.id = b.rider_id
  left join auth.users u on u.id = b.rider_id
  where sd.stable_id = private.owned_stable_id()
    and b.status = 'pending'
    and sd.day >= private.warsaw_today()
  order by sd.day, b.hour, b.created_at, b.id;
$$;

comment on function public.get_pending_bookings() is
  'Zapisy do przyjecia (#124): zapisy oczekujace osrodka wlasciciela od dzis (Europe/Warsaw), najblizsze terminy pierwsze, z jezdzcem (imie i nazwisko, adres e-mail), slotem (instruktor, plac, rodzaj, limit) i liczba aktywnych zapisow slotu. Zapis, ktorego slot sie zaczal (wygasly), odfiltrowuje odczyt w TS. Inne konta: zero wierszy.';

revoke execute on function public.get_pending_bookings() from public, anon;
grant execute on function public.get_pending_bookings() to authenticated;
