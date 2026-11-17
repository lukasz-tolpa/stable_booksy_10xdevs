-- Zaproszenia instruktorow do konta (#74, spec #70, ADR-0004, GLOSSARY "Instruktor").
--
-- Wlasciciel osrodka wystawia instruktorowi bez konta zaproszenie na adres e-mail i sam
-- przekazuje mu link (aplikacja niczego nie wysyla). Ten ticket: wystawienie, wycofanie
-- i lista. Przyjecie zaproszenia przy rejestracji (odczyt po tokenie dla strony rejestracji,
-- funkcja przyjecia) to osobny ticket (#75) - tabela jest pod niego zaprojektowana:
--
--   * token: 32 losowe bajty z pgcrypto zapisane szesnastkowo (64 znaki [0-9a-f]); funkcja
--     wystawienia zwraca go RAZ, baza przechowuje wylacznie `sha256(convert_to(token, 'UTF8'))`
--     w `token_hash` (unikalny) - przyjecie szuka zaproszenia po tym skrocie,
--   * zaproszenie zywe = `accepted_at is null and revoked_at is null and expires_at > now()`,
--   * otwarte (nieprzyjete i niewycofane) jest najwyzej jedno na instruktora - indeks
--     czesciowy `instructor_invitations_open_key`; nowe zaproszenie wycofuje poprzednie
--     otwarte (takze wygasle), wiec stary link przestaje dzialac,
--   * adres zapisany po `lower(btrim(...))` - przyjecie porownuje go z adresem konta tak samo.
--
-- Dostep: tabela zamknieta dla anon i authenticated (RLS bez polityk, uprawnienia odebrane);
-- czytaja ja i zmieniaja wylacznie funkcje security definer ponizej.
--
-- Kody odmow:
--   42501  wola nie-wlasciciel (instruktor bez praw wlasciciela, jezdziec, konto bez osrodka)
--   SB013  instruktor spoza osrodka wlasciciela albo nieistniejacy (jeden kod - bez wyroczni istnienia)
--   SB014  instruktor nieaktywny (tylko wystawienie)
--   SB015  instruktor ma juz konto (tylko wystawienie; takze wlasciciel)
--   23514  adres pusty albo niepoprawny (ograniczenie instructor_invitations_email_check)
-- Dowod: supabase/tests/instructor_invitations.sql.

create table public.instructor_invitations (
  id bigint generated always as identity primary key,
  stable_id bigint not null references public.stables (id) on delete cascade,
  instructor_id bigint not null,
  email text not null,
  token_hash bytea not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  -- Instruktor zaproszenia nalezy do osrodka zaproszenia.
  constraint instructor_invitations_instructor_fkey
    foreign key (instructor_id, stable_id) references public.instructors (id, stable_id) on delete cascade,
  constraint instructor_invitations_token_hash_key unique (token_hash),
  constraint instructor_invitations_email_check
    check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  constraint instructor_invitations_expiry_check check (expires_at > created_at),
  constraint instructor_invitations_closed_once_check check (accepted_at is null or revoked_at is null)
);

comment on table public.instructor_invitations is
  'Zaproszenia instruktorow do konta (#74). Sam token nie jest przechowywany - tylko skrot sha256. Zywe = nieprzyjete, niewycofane i niewygasle. Dostep wylacznie przez funkcje security definer.';
comment on column public.instructor_invitations.email is
  'Adres, dla ktorego zaproszenie dziala - zapisany malymi literami, bez spacji na brzegach.';
comment on column public.instructor_invitations.token_hash is
  'sha256(convert_to(token, ''UTF8'')); token (64 znaki hex) zna tylko link przekazany instruktorowi.';
comment on column public.instructor_invitations.expires_at is
  'Wygasniecie: 7 dni po wystawieniu.';

-- Najwyzej jedno otwarte zaproszenie na instruktora; wystawienie zamyka poprzednie przed wstawieniem.
create unique index instructor_invitations_open_key
  on public.instructor_invitations (instructor_id)
  where accepted_at is null and revoked_at is null;

create index instructor_invitations_stable_id_idx on public.instructor_invitations (stable_id);

alter table public.instructor_invitations enable row level security;
revoke all on public.instructor_invitations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Instruktor osrodka wlasciciela - wspolny poczatek wystawienia i wycofania
-- ---------------------------------------------------------------------------

create or replace function private.owned_instructor_for_invitation(p_instructor_id bigint)
returns public.instructors
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stable bigint := private.owned_stable_id();
  v_instructor public.instructors;
begin
  if v_stable is null then
    raise exception 'Zaproszeniami zarzadza wylacznie wlasciciel osrodka' using errcode = '42501';
  end if;

  -- Blokada wiersza instruktora serializuje rownolegle wystawienia i wycofania tego instruktora.
  select * into v_instructor
  from public.instructors i
  where i.id = p_instructor_id and i.stable_id = v_stable
  for update;

  if v_instructor.id is null then
    raise exception 'Instruktor spoza osrodka' using errcode = 'SB013';
  end if;

  return v_instructor;
end;
$$;

revoke execute on function private.owned_instructor_for_invitation(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Wystawienie
-- ---------------------------------------------------------------------------

create or replace function public.issue_instructor_invitation(p_instructor_id bigint, p_email text)
returns table (token text, expires_at timestamptz)
language plpgsql
-- SECURITY DEFINER celowo: tabela zaproszen jest zamknieta dla authenticated. Osrodek bierze
-- z sesji (private.owned_stable_id), nigdy z argumentu.
security definer
set search_path = ''
as $$
declare
  v_instructor public.instructors := private.owned_instructor_for_invitation(p_instructor_id);
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if not v_instructor.active then
    raise exception 'Instruktor nieaktywny' using errcode = 'SB014';
  end if;

  if v_instructor.account_id is not null then
    raise exception 'Instruktor ma juz konto' using errcode = 'SB015';
  end if;

  -- Nowe zaproszenie uniewaznia poprzednie otwarte (takze wygasle) - stary link przestaje dzialac.
  update public.instructor_invitations as inv
  set revoked_at = now()
  where inv.instructor_id = v_instructor.id
    and inv.accepted_at is null
    and inv.revoked_at is null;

  return query
  insert into public.instructor_invitations as inv (stable_id, instructor_id, email, token_hash)
  values (v_instructor.stable_id, v_instructor.id, lower(btrim(coalesce(p_email, ''))),
          sha256(convert_to(v_token, 'UTF8')))
  returning v_token, inv.expires_at;
end;
$$;

comment on function public.issue_instructor_invitation(bigint, text) is
  'Wystawienie zaproszenia instruktora do konta (#74): wylacznie wlasciciel, instruktor wlasnego osrodka, aktywny i bez konta. Wycofuje poprzednie otwarte zaproszenie instruktora. Zwraca token (64 znaki hex, jedyny raz) i wygasniecie. Kody: 42501, SB013, SB014, SB015, 23514.';

revoke execute on function public.issue_instructor_invitation(bigint, text) from public, anon;
grant execute on function public.issue_instructor_invitation(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Wycofanie
-- ---------------------------------------------------------------------------

create or replace function public.revoke_instructor_invitation(p_instructor_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_instructor public.instructors := private.owned_instructor_for_invitation(p_instructor_id);
  v_count int;
begin
  update public.instructor_invitations as inv
  set revoked_at = now()
  where inv.instructor_id = v_instructor.id
    and inv.accepted_at is null
    and inv.revoked_at is null
    and inv.expires_at > now();
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

comment on function public.revoke_instructor_invitation(bigint) is
  'Wycofanie zywego zaproszenia instruktora wlasnego osrodka (#74): wylacznie wlasciciel. true - zaproszenie wycofane, false - instruktor nie mial zywego zaproszenia. Kody: 42501, SB013.';

revoke execute on function public.revoke_instructor_invitation(bigint) from public, anon;
grant execute on function public.revoke_instructor_invitation(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Lista zywych zaproszen osrodka
-- ---------------------------------------------------------------------------

create or replace function public.list_instructor_invitations()
returns table (instructor_id bigint, email text, expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_stable bigint := private.owned_stable_id();
begin
  if v_stable is null then
    raise exception 'Zaproszenia widzi wylacznie wlasciciel osrodka' using errcode = '42501';
  end if;

  return query
  select inv.instructor_id, inv.email, inv.expires_at
  from public.instructor_invitations inv
  join public.instructors i on i.id = inv.instructor_id
  where inv.stable_id = v_stable
    and inv.accepted_at is null
    and inv.revoked_at is null
    and inv.expires_at > now()
    and i.active
    and i.account_id is null
  order by inv.instructor_id;
end;
$$;

comment on function public.list_instructor_invitations() is
  'Zywe zaproszenia osrodka wlasciciela (#74) - tylko instruktorzy aktywni i bez konta; bez tokenu i skrotu. Kod: 42501 dla nie-wlasciciela.';

revoke execute on function public.list_instructor_invitations() from public, anon;
grant execute on function public.list_instructor_invitations() to authenticated;
