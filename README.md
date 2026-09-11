# Stable Booksy

Zapisy na jazdy konne dla małych stadnin. Ośrodek układa grafik dnia — godziny pracy
i konie, które tego dnia pracują — a jeździec sam wybiera wolny slot i się zapisuje.
Bez telefonów, bez zeszytu, bez dubli.

**Produkcja:** https://stable-booksy.tolpa-lukasz97.workers.dev

## Problem

Stadniny prowadzą grafik ręcznie, w zeszycie albo w arkuszu. Osoba układająca dzień musi
sama pilnować, który koń jest o danej godzinie wolny i czy zapisy się nie zderzają.
Przydział koni to nie jest zwykły kalendarz, tylko alokacja zasobu z ograniczeniami,
której Kalendarz Google ani Booksy nie pilnują. Stąd ta aplikacja.

## Dwie role

| Rola         | Co robi                                                                                 |
| ------------ | --------------------------------------------------------------------------------------- |
| **Ośrodek**  | Zakłada stadninę, prowadzi stado koni, układa grafik dnia, widzi listę zapisów na dzień |
| **Jeździec** | Przegląda ośrodki, wybiera wolny slot godzina × koń, zapisuje się i odwołuje zapis      |

Rola jest wybierana przy rejestracji i zapisywana w profilu przez trigger bazy. Pośrednik
(`src/middleware.ts`) pilnuje tras: konto ośrodka nie wejdzie na ekrany jeźdźca i odwrotnie.

## Jak to działa

Najważniejsza reguła nie mieszka w kodzie aplikacji, tylko w bazie. Jeden slot to trójka
(dzień grafiku, koń, godzina), a podwójnej rezerwacji pilnuje częściowy unikalny indeks
`bookings_active_slot_key`. Gdy dwóch jeźdźców kliknie ten sam slot w tej samej chwili,
dokładnie jeden zapis przechodzi, a drugi dostaje po polsku „Ten slot został właśnie
zajęty". Tak samo działają pozostałe gwarancje: zapis poza godzinami pracy odrzuca trigger,
a zmiana grafiku, która porzuciłaby istniejące zapisy, jest blokowana z własnym kodem błędu.

Godziny pracy to zakres półotwarty: 10–16 oznacza sloty od 10:00 do 15:00.

Jeździec nigdy nie widzi, kto zajął slot. Zajętość przychodzi z jednej funkcji
`get_taken_slots`, która zwraca wyłącznie parę (koń, godzina), bez tożsamości.

## Stos

- [Astro](https://astro.build/) 6 w trybie SSR, wyspy [React](https://react.dev/) 19 tylko
  tam, gdzie potrzebna jest interakcja
- [TypeScript](https://www.typescriptlang.org/) 5, [Tailwind CSS](https://tailwindcss.com/) 4,
  komponenty shadcn/ui
- [Supabase](https://supabase.com/) — uwierzytelnianie i Postgres z politykami dostępu na
  poziomie wierszy
- [Cloudflare Workers](https://workers.cloudflare.com/) — wdrożenie na brzegu sieci

Warstwa wizualna ma własny kontrakt: `DESIGN.md` w katalogu głównym. Aplikacja ma jeden,
jasny motyw — trybu ciemnego nie ma i nie należy go dodawać.

## Uruchomienie lokalne

Potrzebujesz Node 22.14.0 (zgodnie z `.nvmrc`) oraz Dockera, bo lokalna Supabase działa
w kontenerach.

```bash
npm install
npx supabase start          # wymaga Dockera
npx supabase db reset       # schemat z migracji + dane demo z seed.sql
```

Skopiuj `.env.example` do `.dev.vars` i wpisz adres oraz klucz z `npx supabase status`.
Sekrety czyta zbudowany worker ze snapshotu zrobionego przy `astro build`, nie ze
zmiennych procesu.

```bash
npm run dev                 # http://localhost:4321
```

**Rejestracja nie wymaga potwierdzania adresu e-mail.** Potwierdzenia są wyłączone
i lokalnie, i na produkcji, więc konto zakłada się i loguje od razu.

### Konta demo — produkcja

Do obejrzenia aplikacji bez zakładania konta. Hasło dla obu: `sekret123`

| Rola     | Adres                       | Co zastaniesz                                             |
| -------- | --------------------------- | --------------------------------------------------------- |
| Ośrodek  | `osrodek.demo@example.com`  | Stadnina Pod Dębem, cztery konie, grafik na trzy tygodnie |
| Jeździec | `jezdziec.demo@example.com` | Katalog ośrodków z wolnymi slotami do zapisania           |

Rejestracja jest otwarta i nie wymaga potwierdzania adresu, więc równie dobrze możesz
założyć własne konto w dowolnej roli.

### Konta demo — lokalnie

Po `npx supabase db reset`, hasło dla wszystkich: `sekret123`

| Rola     | Adres                       |
| -------- | --------------------------- |
| Ośrodek  | `osrodek.debem@example.com` |
| Ośrodek  | `osrodek.rzeka@example.com` |
| Jeździec | `anna.kowalska@example.com` |
| Jeździec | `piotr.nowak@example.com`   |

Dane z seeda układają grafik na **jutro**, więc po dobie bez `db reset` ekran slotów
będzie pusty. Skrypty testowe wykrywają to i podpowiadają ponowne załadowanie.

## Testy

Trzy warstwy, każda odpowiada na inne pytanie.

```bash
npm test                    # Vitest — czysta logika w src/lib/**
npm run test:db             # psql — gwarancje bazy: RLS, współbieżność, guardraile grafiku
npm run test:e2e            # Playwright — pełne ścieżki użytkownika w przeglądarce
```

Testy bazodanowe i przeglądarkowe wymagają działającego stacka i seeda załadowanego
**dzisiaj**. Suita przeglądarkowa buduje aplikację i uruchamia ją na podglądzie, więc
sprawdza to samo, co zobaczy użytkownik: formularze, przekierowania i ciasteczka sesji.

Dwa scenariusze niosą najwięcej: pełna pętla jeźdźca od katalogu przez zapis do odwołania
oraz odmowa przy slocie, który ktoś zajął w międzyczasie.

Strategia i wzorce dopisywania testów: `context/foundation/test-plan.md`.

## Dostępne polecenia

| Polecenie          | Co robi                                             |
| ------------------ | --------------------------------------------------- |
| `npm run dev`      | Serwer deweloperski                                 |
| `npm run build`    | Budowanie produkcyjne                               |
| `npm run preview`  | Podgląd zbudowanej wersji na runtime Cloudflare     |
| `npm run lint`     | ESLint z kontrolą typów                             |
| `npm run check`    | `astro check`                                       |
| `npm run format`   | Prettier                                            |
| `npm run db:types` | Regeneracja typów bazy (wymaga działającego stacka) |

## Struktura

```
src/pages/          trasy Astro; api/ to punkty końcowe formularzy
src/components/     Astro dla treści statycznej, ui/ dla bloków wspólnych,
                    wyspy React tylko tam, gdzie jest interakcja
src/lib/            logika domenowa: sloty, grafik, zapisy, błędy, sesja
src/middleware.ts   bramkowanie tras według roli
supabase/           migracje ze schematem i politykami, seed.sql, tests/
context/            dokumenty projektu (patrz niżej)
```

## Dokumenty projektu

| Plik                                   | Co zawiera                                                    |
| -------------------------------------- | ------------------------------------------------------------- |
| `context/foundation/prd.md`            | Wymagania produktowe, persony, kryteria sukcesu               |
| `context/foundation/roadmap.md`        | Kolejność prac w pionowych wycinkach                          |
| `context/foundation/tech-stack.md`     | Wybór stosu i uzasadnienie                                    |
| `context/foundation/infrastructure.md` | Środowiska i wdrożenie                                        |
| `context/foundation/test-plan.md`      | Strategia testów i wzorce ich dopisywania                     |
| `context/foundation/lessons.md`        | Reguły wyciągnięte z poprzednich zmian                        |
| `AGENTS.md`                            | Zasady pracy w repozytorium, w tym kontrakt warstwy wizualnej |
| `DESIGN.md`                            | System wizualny: tokeny, typografia, stany                    |

Historia zmian leży w `context/archive/`, po jednym folderze na wycinek, razem z planem
i przeglądem implementacji.

## Wdrożenie i CI

Gałąź `main` przyjmuje wyłącznie scalenia przez pull request, z trzema wymaganymi bramkami:
`ci` (lint, testy jednostkowe, kontrola typów, build), `db-tests` i `e2e`. Produkcję wdraża
Cloudflare Workers Builds z gałęzi `main`, nie GitHub Actions.

Szczegóły: `context/changes/deployment/deployment-plan.md`.

## Licencja

MIT
