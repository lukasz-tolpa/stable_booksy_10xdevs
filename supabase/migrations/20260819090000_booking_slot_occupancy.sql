-- S-04 (slot-booking-flow): odczyt zajetosci slotow dla jezdzca.
--
-- Polityka SELECT na bookings pokazuje jezdzcowi wylacznie jego wlasne zapisy,
-- wiec zajetosci cudzych slotow nie da sie policzyc zwyklym odczytem. Funkcja
-- security definer zwraca wylacznie pary (kon, godzina) aktywnych zapisow
-- danego osrodka i dnia - bez rider_id ani zadnej innej tozsamosci - dzieki
-- czemu guardrail izolacji z F-01 pozostaje nienaruszony.
--
-- Funkcja mieszka w schemacie public (a nie private jak dotychczasowe
-- helpery), bo musi byc wywolywalna przez PostgREST (.rpc) z sesja
-- uzytkownika. To pierwsza i jedyna funkcja RPC w projekcie.

create or replace function public.get_taken_slots(p_stable_id bigint, p_day date)
returns table (horse_id bigint, hour smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select b.horse_id, b.hour
  from public.bookings b
  join public.schedule_days sd on sd.id = b.schedule_day_id
  where sd.stable_id = p_stable_id
    and sd.day = p_day
    and b.status = 'active';
$$;

comment on function public.get_taken_slots(bigint, date) is
  'Zajete sloty (kon x godzina) osrodka na dany dzien. Security definer: omija RLS bookings swiadomie, ale zwraca wylacznie zajetosc - bez rider_id, statusu ani zadnej tozsamosci jezdzca.';

revoke execute on function public.get_taken_slots(bigint, date) from public, anon;
grant execute on function public.get_taken_slots(bigint, date) to authenticated;
