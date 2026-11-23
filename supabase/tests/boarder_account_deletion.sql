-- Dowod usuniecia konta pensjonariusza (#120, spec #112, ADR 0001, ADR 0005, GLOSSARY „Pobyt”,
-- „Pensjonariusz”, „Jeździec zanonimizowany”).
--
-- Gwarancje w bazie:
--   * usuniecia konta pensjonariusza nigdy sie nie odmawia - ani kon w pobycie (w dwoch osrodkach),
--     ani jazdy, przyszly zapis, stawka indywidualna czy koszt dodatkowy tego nie blokuja,
--   * trwajace pobyty jego koni we wszystkich osrodkach koncza sie w dniu usuniecia (Europe/Warsaw,
--     private.warsaw_today()); dzien wyjazdu wpisuje „usuniecie konta” (departure_set_by =
--     'account_deleted'); pobyt, ktory jeszcze sie nie zaczal (przyjazd po dzis), znika,
--   * zakonczone wczesniej pobyty zostaja bez zmian,
--   * konie zostaja w osrodkach bez wlasciciela (horse_owners.rider_id NULL); osrodek widzi je
--     z zakonczonym pobytem w public.get_stable_boarding_horses(), a konia, ktorego pobyt sie nie
--     zaczal - bez pobytu (#112, kolumny pobytu NULL),
--   * zapisy jak w ADR 0001: przeszla jazda na slocie treningowym na Hrabim zostaje bez jezdzca
--     („Usunięci jeźdźcy” w statystykach) i z koniem (w statystykach kon zostaje), przyszly zapis
--     na slot treningowy znika,
--   * konie i pobyty innego pensjonariusza sa nietkniete.
--
-- Jako kto: konto kasuje postgres przez auth.users (tak robi to administracyjne API Auth; kaskada
-- schodzi do public.profiles, gdzie siedza reguly). Odczyty osrodkow ida przez RLS jako wlasciciel
-- Pod Dębem (1111...) i wlascicielka Nad Rzeką (2222...).
-- Persony z seeda: Katarzyna Zając (1212..., pensjonariuszka, kon Hrabia Pod Dębem od 90 dni,
-- pobyt trwa), Piotr (4444..., jezdziec), Joanna Wrona (instruktorka Pod Dębem).
--
-- Zapisy Katarzyny to prawdziwe zapisy na sloty treningowe Joanny (wczoraj i za 3 dni), wstawione
-- z wlaczonymi wyzwalaczami: kon pensjonariuszki (Hrabia) przypisuje regula slotu treningowego
-- (bookings_slot_rules, #115), a usuniecie konta idzie po wszystkich regulach zapisu (#112).
--
-- Wymaga swiezego seeda (`npx supabase db reset` tego samego dnia).
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/boarder_account_deletion.sql
--
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Usuniecie konta pensjonariusza: setup (postgres) ==='

begin;

do $$
declare
  c_katarzyna constant uuid := '12121212-1212-1212-1212-121212121212';
  c_piotr constant uuid := '44444444-4444-4444-4444-444444444444';
  v_today date := private.warsaw_today();
  v_debem bigint;
  v_rzeka bigint;
  v_joanna bigint;
  v_hrabia bigint;
  v_hrabia_stay bigint;
  v_horse bigint;
  v_id bigint;
  v_past_day bigint;
  v_future_day bigint;
begin
  select s.id into v_debem from public.stables s where s.owner_id = '11111111-1111-1111-1111-111111111111';
  select s.id into v_rzeka from public.stables s where s.owner_id = '22222222-2222-2222-2222-222222222222';
  select i.id into v_joanna from public.instructors i where i.stable_id = v_debem and i.name = 'Joanna Wrona';
  select h.id into v_hrabia from public.horses h
  where h.stable_id = v_debem and h.name = 'Hrabia' and h.kind = 'boarding';
  select s.id into v_hrabia_stay from public.horse_stays s
  where s.horse_id = v_hrabia and s.departure_day is null;

  if v_debem is null or v_rzeka is null or v_joanna is null or v_hrabia is null or v_hrabia_stay is null then
    raise exception 'Brak danych demo albo seed nieaktualny - uruchom npx supabase db reset';
  end if;
  perform set_config('app.hrabia', v_hrabia::text, true);
  perform set_config('app.hrabia_stay', v_hrabia_stay::text, true);

  -- Wczesniejszy, zakonczony pobyt Hrabiego - ma zostac bez zmian.
  insert into public.horse_stays (horse_id, stable_id, arrival_day, departure_day, departure_set_by, departure_set_at)
  values (v_hrabia, v_debem, v_today - 400, v_today - 200, 'stable', now() - interval '200 days')
  returning id into v_id;
  perform set_config('app.hrabia_old_stay', v_id::text, true);

  -- Drugi osrodek: kon Katarzyny Sokol, pobyt od dzis (dzien wyjazdu = dzien przyjazdu).
  insert into public.horses (stable_id, name, kind) values (v_rzeka, 'Sokół', 'boarding') returning id into v_horse;
  insert into public.horse_owners (horse_id, stable_id, rider_id) values (v_horse, v_rzeka, c_katarzyna);
  insert into public.horse_stays (horse_id, stable_id, arrival_day) values (v_horse, v_rzeka, v_today)
  returning id into v_id;
  perform set_config('app.sokol', v_horse::text, true);
  perform set_config('app.sokol_stay', v_id::text, true);

  -- Wicher Katarzyny jeszcze nie przyjechal (przyjazd za 5 dni) - pobyt, ktory sie nie zaczal.
  insert into public.horses (stable_id, name, kind) values (v_rzeka, 'Wicher', 'boarding') returning id into v_horse;
  insert into public.horse_owners (horse_id, stable_id, rider_id) values (v_horse, v_rzeka, c_katarzyna);
  insert into public.horse_stays (horse_id, stable_id, arrival_day) values (v_horse, v_rzeka, v_today + 5)
  returning id into v_id;
  perform set_config('app.wicher', v_horse::text, true);
  perform set_config('app.wicher_stay', v_id::text, true);

  -- Kontrola: kon innego pensjonariusza (Piotr) w tym samym osrodku, pobyt trwa.
  insert into public.horses (stable_id, name, kind) values (v_rzeka, 'Bursztyn', 'boarding') returning id into v_horse;
  insert into public.horse_owners (horse_id, stable_id, rider_id) values (v_horse, v_rzeka, c_piotr);
  insert into public.horse_stays (horse_id, stable_id, arrival_day) values (v_horse, v_rzeka, v_today - 30)
  returning id into v_id;
  perform set_config('app.bursztyn', v_horse::text, true);
  perform set_config('app.bursztyn_stay', v_id::text, true);

  -- Rozliczenia: stawka indywidualna i koszt dodatkowy Katarzyny w biezacym miesiacu.
  insert into public.rates (stable_id, rider_id, from_month, amount)
  values (v_debem, c_katarzyna, private.warsaw_month_start(), 9000);
  insert into public.extra_costs (stable_id, rider_id, month, name, amount)
  values (v_debem, c_katarzyna, private.warsaw_month_start(), 'Kowal', 15000);

  -- Dzien wczorajszy (miniony) i dzien za 3 dni (przyszly) u Joanny Pod Dębem.
  insert into public.schedule_days (stable_id, day, open_hour, close_hour)
  values (v_debem, v_today - 1, 10, 16)
  on conflict (stable_id, day) do update set open_hour = 10, close_hour = 16
  returning id into v_past_day;
  insert into public.schedule_days (stable_id, day, open_hour, close_hour)
  values (v_debem, v_today + 3, 10, 16)
  on conflict (stable_id, day) do update set open_hour = 10, close_hour = 16
  returning id into v_future_day;
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_past_day, v_joanna, v_debem), (v_future_day, v_joanna, v_debem)
  on conflict do nothing;
  -- Slot treningowy Joanny o 12:00 obu dni (pozostale godziny rekreacyjne).
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats, kind)
  select d, v_joanna, h, 2, case when h = 12 then 'training' else 'recreation' end
  from unnest(array[v_past_day, v_future_day]) d, generate_series(10, 15) h
  on conflict (schedule_day_id, instructor_id, hour) do update set seats = 2, kind = excluded.kind;

  -- Przeszla jazda i przyszly zapis Katarzyny na slot treningowy, wyzwalacze wlaczone: jedynego konia
  -- pensjonariuszki z pobytem w dniu jazdy (Hrabia) przypisuje regula slotu treningowego.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (v_past_day, v_joanna, 12, c_katarzyna)
  returning id, horse_id into v_id, v_horse;
  if v_horse is distinct from v_hrabia then
    raise exception 'setup: przeszla jazda na slocie treningowym bez Hrabiego (kon %)', v_horse;
  end if;
  perform set_config('app.past_ride', v_id::text, true);

  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (v_future_day, v_joanna, 12, c_katarzyna)
  returning id, horse_id into v_id, v_horse;
  if v_horse is distinct from v_hrabia then
    raise exception 'setup: przyszly zapis na slot treningowy bez Hrabiego (kon %)', v_horse;
  end if;
  perform set_config('app.future_booking', v_id::text, true);

  raise notice 'setup: dzis=%', v_today;
end $$;

\echo '=== Usuniecie konta pensjonariusza (postgres, przez auth.users) ==='

do $$
begin
  delete from auth.users where id = '12121212-1212-1212-1212-121212121212';
  raise notice 'PASS 1: usuniecie konta pensjonariusza nie zostalo odmowione';
exception when others then
  raise exception 'FAIL 1: usuniecie konta pensjonariusza odmowione: % %', sqlstate, sqlerrm;
end $$;

do $$
declare
  v_failures int := 0;
  v_today date := private.warsaw_today();
  v int;
  s record;
  r record;
begin
  select count(*) into v from public.profiles where id = '12121212-1212-1212-1212-121212121212';
  if v = 0 then
    raise notice 'PASS 2: profil pensjonariusza usuniety razem z kontem';
  else
    raise notice 'FAIL 2: profil pensjonariusza nadal istnieje';
    v_failures := v_failures + 1;
  end if;

  -- 3. Trwajace pobyty w obu osrodkach koncza sie dzis, wpisane przez usuniecie konta.
  for r in
    select * from (values
      ('3a Hrabia Pod Dębem, pobyt od 90 dni', 'app.hrabia_stay'),
      ('3b Sokol Nad Rzeką, pobyt od dzis',    'app.sokol_stay')
    ) as t (label, setting)
  loop
    select st.departure_day, st.departure_set_by, st.departure_set_at into s
    from public.horse_stays st where st.id = current_setting(r.setting)::bigint;
    if s.departure_day = v_today and s.departure_set_by = 'account_deleted' and s.departure_set_at is not null then
      raise notice 'PASS %: pobyt zakonczony dzis przez usuniecie konta', r.label;
    else
      raise notice 'FAIL %: wyjazd=% przez=% kiedy=%', r.label, s.departure_day, s.departure_set_by, s.departure_set_at;
      v_failures := v_failures + 1;
    end if;
  end loop;

  -- 4. Zakonczony wczesniej pobyt zostaje bez zmian.
  select st.departure_day, st.departure_set_by into s
  from public.horse_stays st where st.id = current_setting('app.hrabia_old_stay')::bigint;
  if s.departure_day = v_today - 200 and s.departure_set_by = 'stable' then
    raise notice 'PASS 4: wczesniejszy pobyt bez zmian';
  else
    raise notice 'FAIL 4: wczesniejszy pobyt zmieniony: wyjazd=% przez=%', s.departure_day, s.departure_set_by;
    v_failures := v_failures + 1;
  end if;

  -- 5. Pobyt, ktory sie nie zaczal, znika; kon zostaje.
  select count(*) into v from public.horse_stays where id = current_setting('app.wicher_stay')::bigint;
  if v = 0 then
    raise notice 'PASS 5: pobyt z przyjazdem po dzis usuniety';
  else
    raise notice 'FAIL 5: pobyt z przyjazdem po dzis nadal istnieje';
    v_failures := v_failures + 1;
  end if;

  -- 6. Konie zostaja w osrodkach bez wlasciciela.
  for r in
    select * from (values ('6a Hrabia', 'app.hrabia'), ('6b Sokol', 'app.sokol'), ('6c Wicher', 'app.wicher')) as t (label, setting)
  loop
    select count(*) into v
    from public.horses h
    join public.horse_owners o on o.horse_id = h.id and o.stable_id = h.stable_id
    where h.id = current_setting(r.setting)::bigint and h.kind = 'boarding' and o.rider_id is null;
    if v = 1 then
      raise notice 'PASS %: kon zostal w osrodku bez wlasciciela', r.label;
    else
      raise notice 'FAIL %: kon zniknal albo nadal ma wlasciciela', r.label;
      v_failures := v_failures + 1;
    end if;
  end loop;

  -- 7. Zapisy jak w ADR 0001: przeszla jazda bez jezdzca, z koniem (statystyki); przyszly zapis znika.
  select count(*) into v from public.bookings
  where id = current_setting('app.past_ride')::bigint and rider_id is null and status = 'active'
    and horse_id = current_setting('app.hrabia')::bigint;
  if v = 1 then
    raise notice 'PASS 7a: przeszla jazda na slocie treningowym zostala bez jezdzca, z Hrabim';
  else
    raise notice 'FAIL 7a: przeszla jazda skasowana, zmieniona, z jezdzcem albo bez konia';
    v_failures := v_failures + 1;
  end if;

  select count(*) into v from public.bookings where id = current_setting('app.future_booking')::bigint;
  if v = 0 then
    raise notice 'PASS 7b: przyszly zapis skasowany';
  else
    raise notice 'FAIL 7b: przyszly zapis nadal istnieje';
    v_failures := v_failures + 1;
  end if;

  -- 8. Kon i pobyt innego pensjonariusza nietkniete.
  select count(*) into v
  from public.horse_owners o
  join public.horse_stays st on st.horse_id = o.horse_id
  where o.horse_id = current_setting('app.bursztyn')::bigint
    and o.rider_id = '44444444-4444-4444-4444-444444444444'
    and st.id = current_setting('app.bursztyn_stay')::bigint and st.departure_day is null;
  if v = 1 then
    raise notice 'PASS 8: kon innego pensjonariusza z trwajacym pobytem';
  else
    raise notice 'FAIL 8: kon albo pobyt innego pensjonariusza zmieniony';
    v_failures := v_failures + 1;
  end if;

  if v_failures > 0 then
    raise exception '% asercji stanu po usunieciu konta pensjonariusza nie przeszlo', v_failures;
  end if;
end $$;

\echo '=== Usuniecie konta pensjonariusza: co widza osrodki (RLS) ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  r record;
begin
  select * into r from public.get_stable_boarding_horses()
  where horse_id = current_setting('app.hrabia')::bigint
  order by arrival_day desc limit 1;
  if r.horse_id is null or r.rider_id is not null or r.rider_name is not null
     or r.departure_day is distinct from private.warsaw_today() or r.departure_set_by is distinct from 'account_deleted' then
    raise exception 'FAIL 9: Pod Dębem widzi Hrabiego: jezdziec=% wyjazd=% przez=%', r.rider_id, r.departure_day, r.departure_set_by;
  end if;
  raise notice 'PASS 9: Pod Dębem widzi Hrabiego bez wlasciciela z pobytem zakonczonym dzis';
end $$;

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  r record;
begin
  select * into r from public.get_stable_boarding_horses() where horse_id = current_setting('app.sokol')::bigint;
  if r.horse_id is null or r.rider_id is not null
     or r.departure_day is distinct from private.warsaw_today() or r.departure_set_by is distinct from 'account_deleted' then
    raise exception 'FAIL 10: Nad Rzeką widzi Sokola: jezdziec=% wyjazd=% przez=%', r.rider_id, r.departure_day, r.departure_set_by;
  end if;
  raise notice 'PASS 10: Nad Rzeką widzi Sokola bez wlasciciela z pobytem zakonczonym dzis';

  -- 11 (#112). Wicher, ktory nie zdazyl przyjechac, zostaje na liscie osrodka - bez wlasciciela i bez pobytu.
  if (
    select count(*) from public.get_stable_boarding_horses() b
    where b.horse_id = current_setting('app.wicher')::bigint
      and b.rider_id is null and b.stay_id is null and b.arrival_day is null
  ) <> 1
  or exists (
    select 1 from public.get_stable_boarding_horses() b
    where b.horse_id = current_setting('app.wicher')::bigint and b.stay_id is not null
  ) then
    raise exception 'FAIL 11: Nad Rzeką nie widzi Wichra bez pobytu';
  end if;
  raise notice 'PASS 11: Nad Rzeką widzi Wichra bez wlasciciela i bez pobytu';
end $$;

rollback;

\echo '--- WSZYSTKIE ASERCJE USUNIECIA KONTA PENSJONARIUSZA PRZESZLY ---'
