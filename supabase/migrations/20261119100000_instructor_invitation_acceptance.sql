-- Przyjecie zaproszenia instruktora przy zakladaniu konta (#75, spec #70, ADR-0004).
--
-- Instruktor otwiera link `/auth/signup?zaproszenie=<token>` (#74) i zaklada konto. Dwie funkcje:
--
--   * public.invitation_by_token(token) - odczyt dla strony rejestracji, dostepny anonimowo:
--     wylacznie nazwa osrodka, adres zaproszenia i stan (live / expired / revoked / accepted /
--     inactive / has_account); nieznany token nie zwraca wiersza,
--   * private.accept_instructor_invitation(konto, adres, token) - przyjecie. Wola je trigger
--     handle_new_user, gdy metadane rejestracji niosa `invitation_token`: w TEJ SAMEJ transakcji,
--     w ktorej GoTrue zaklada konto, profil dostaje role `instructor` (niezaleznie od roli
--     w metadanych), instruktor zaproszenia - powiazanie z kontem, zaproszenie - `accepted_at`.
--     Odmowa przerywa cala rejestracje: konto nie powstaje, wiec nie zostaje konto instruktora
--     bez osrodka. Przyjecie przy zakladaniu konta (a nie osobnym wywolaniem z sesja) dziala
--     tez wtedy, gdy produkcja wlaczy potwierdzanie e-maila - sesji wtedy nie ma (spec #70,
--     Further Notes).
--
-- Dlaczego trigger, a nie RPC po rejestracji: rola konta jest niezmienna z sesji
-- (profiles_role_immutable), a konto zalozone przed przyjeciem zostaloby po odmowie (np. link
-- wycofany w miedzyczasie) kontem bez osrodka z zajetym adresem. GoTrue nie przekazuje kodu
-- bledu triggera (500 "Database error saving new user"), dlatego aplikacja ustala powod
-- odmowy z invitation_by_token przed rejestracja i po jej niepowodzeniu.
--
-- Token zostaje w raw_user_meta_data konta - jest to token zaproszenia juz przyjetego, wiec
-- nie otwiera niczego (kolejne przyjecie dostaje SB019). Baza nadal nie przechowuje tokenu
-- zadnego zaproszenia zywego.
--
-- Kody odmow przyjecia:
--   SB016  nieznany token (takze pusty)
--   SB017  zaproszenie wygaslo
--   SB018  zaproszenie wycofane (takze zastapione nowym)
--   SB019  zaproszenie juz wykorzystane
--   SB020  adres konta inny niz adres zaproszenia (bez wielkosci liter i spacji na brzegach)
--   SB021  instruktor nieaktywny
--   SB022  instruktor ma juz konto
-- Dowod: supabase/tests/instructor_invitation_acceptance.sql.

-- ---------------------------------------------------------------------------
-- Odczyt po tokenie (strona rejestracji)
-- ---------------------------------------------------------------------------

create or replace function public.invitation_by_token(p_token text)
returns table (stable_name text, email text, state text)
language sql
stable
-- SECURITY DEFINER celowo: tabela zaproszen jest zamknieta dla anon i authenticated. Zwraca
-- tylko to, co strona rejestracji pokazuje; znajomosc tokenu jest jedynym kluczem.
security definer
set search_path = ''
as $$
  select
    s.name,
    inv.email,
    case
      when inv.accepted_at is not null then 'accepted'
      when inv.revoked_at is not null then 'revoked'
      when inv.expires_at <= now() then 'expired'
      when not i.active then 'inactive'
      when i.account_id is not null then 'has_account'
      else 'live'
    end
  from public.instructor_invitations inv
  join public.instructors i on i.id = inv.instructor_id
  join public.stables s on s.id = inv.stable_id
  where inv.token_hash = sha256(convert_to(p_token, 'UTF8'));
$$;

comment on function public.invitation_by_token(text) is
  'Zaproszenie instruktora po tokenie dla strony rejestracji (#75): nazwa osrodka, adres i stan (live, expired, revoked, accepted, inactive, has_account). Nieznany token - brak wiersza. Dostepna anonimowo.';

revoke execute on function public.invitation_by_token(text) from public;
grant execute on function public.invitation_by_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Przyjecie (wolane z handle_new_user)
-- ---------------------------------------------------------------------------

create or replace function private.accept_instructor_invitation(p_account_id uuid, p_email text, p_token text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.instructor_invitations;
  v_instructor public.instructors;
begin
  -- Blokada wiersza zaproszenia: dwie rownolegle rejestracje z jednym linkiem - druga
  -- zobaczy zaproszenie przyjete (SB019).
  select * into v_invitation
  from public.instructor_invitations inv
  where inv.token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'))
  for update;

  if v_invitation.id is null then
    raise exception 'Nieznany token zaproszenia' using errcode = 'SB016';
  end if;
  if v_invitation.accepted_at is not null then
    raise exception 'Zaproszenie juz wykorzystane' using errcode = 'SB019';
  end if;
  if v_invitation.revoked_at is not null then
    raise exception 'Zaproszenie wycofane' using errcode = 'SB018';
  end if;
  if v_invitation.expires_at <= now() then
    raise exception 'Zaproszenie wygaslo' using errcode = 'SB017';
  end if;
  if lower(btrim(coalesce(p_email, ''))) <> v_invitation.email then
    raise exception 'Adres konta inny niz adres zaproszenia' using errcode = 'SB020';
  end if;

  select * into v_instructor
  from public.instructors i
  where i.id = v_invitation.instructor_id
  for update;

  if not v_instructor.active then
    raise exception 'Instruktor nieaktywny' using errcode = 'SB021';
  end if;
  if v_instructor.account_id is not null then
    raise exception 'Instruktor ma juz konto' using errcode = 'SB022';
  end if;

  update public.instructors set account_id = p_account_id where id = v_instructor.id;
  update public.instructor_invitations set accepted_at = now() where id = v_invitation.id;

  return v_instructor.id;
end;
$$;

comment on function private.accept_instructor_invitation(uuid, text, text) is
  'Przyjecie zaproszenia instruktora przy zakladaniu konta (#75): wiaze konto z instruktorem i oznacza zaproszenie jako przyjete. Wolana wylacznie z handle_new_user. Kody: SB016-SB022.';

revoke execute on function private.accept_instructor_invitation(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Profil powstaje razem z uzytkownikiem - z tokenem zaproszenia jako instruktor zaproszenia
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Klucz z wartoscia JSON null to zwykla rejestracja; pusty string to (nieznany) token.
  v_token text := new.raw_user_meta_data ->> 'invitation_token';
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    -- Twarde mapowanie zamiast przepisania wartosci z metadanych: nieznana rola nie moze
    -- wywalic rejestracji na constraincie - kazda inna wartosc daje jezdzca. Konto z zaproszenia
    -- jest zawsze kontem instruktora.
    case
      when v_token is not null then 'instructor'
      when new.raw_user_meta_data ->> 'role' = 'instructor' then 'instructor'
      else 'rider'
    end,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  );

  if v_token is not null then
    perform private.accept_instructor_invitation(new.id, new.email, v_token);
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Tworzy profil po rejestracji; z tokenem zaproszenia (metadane invitation_token) w tej samej transakcji przyjmuje zaproszenie instruktora (#75) albo przerywa rejestracje kodem SB016-SB022. SECURITY DEFINER + pusty search_path sa wymagane - funkcja wykonuje sie w kontekscie wewnetrznego zapisu Supabase Auth.';
