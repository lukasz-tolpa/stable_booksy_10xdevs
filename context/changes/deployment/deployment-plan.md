# Deploy Stable Booksy → Cloudflare Workers + Supabase Cloud

## Context

Lekcja 5 (Plan Mode deploy): pierwsze wdrożenie MVP zgodnie z `context/foundation/infrastructure.md` (platforma: Cloudflare Workers, free tier) i `tech-stack.md` (Astro 6 + Supabase, auto-deploy-on-merge przez GitHub Actions). Decyzje użytkownika: **założyć nowy hostowany projekt Supabase (eu-central-1/Frankfurt)** oraz **pełny zakres** — ręczny pierwszy deploy + naprawa CI i auto-deploy na merge do `main`.

Stan repo (zbadany): `wrangler.jsonc` już poprawnie celuje we Workers (`main` + `assets` + `nodejs_compat`) — obawa o stary config Pages nie dotyczy. Sekrety czytane przez typowane `astro:env/server` (`SUPABASE_URL`, `SUPABASE_KEY`, `optional: true`) — wzorzec runtime'owy, zweryfikowany w docs Astro: NIE są inline'owane w build. CI (`.github/workflows/ci.yml`) triggeruje na `master`, a gałąź to `main` — CI martwe; brak kroku deploy i tokena Cloudflare. Brak migracji Supabase (app używa tylko `auth.users`). Wszystko SSR (zero `prerender`). Wrangler 4.90.0 (devDep), zalogowany OAuth; `gh` zalogowany (scope repo+workflow).

Fakty zweryfikowane w sieci (2026-07-20): nowe projekty Supabase wydają klucze `sb_publishable_...` (zamiennik anon, właściwy dla `@supabase/ssr`); hostowane projekty mają potwierdzanie e-mail **włączone domyślnie** (konflikt z lokalnym `enable_confirmations = false` i stroną confirm-email auto-potwierdzającą tylko w DEV) — trzeba wyłączyć (`mailer_autoconfirm: true`); wzorzec CI: `cloudflare/wrangler-action@v3` + token z szablonu "Edit Cloudflare Workers"; gotcha adaptera ([withastro/astro#15802](https://github.com/withastro/astro/issues/15802)): adapter może wstrzyknąć binding KV `SESSION` i wrangler interaktywnie provisionuje namespace — dlatego pierwszy deploy MUSI być lokalny, żeby CI nigdy nie trafiło na prompt.

## Wstępne założenia — konfiguracja CLI i Supabase

### Narzędzia i wersje

- Node **22.14.0** przez `.nvmrc` (`nvm use` / setup-node w CI) — jedna wersja lokalnie i w pipeline.
- `wrangler` (^4.90.0) i `supabase` (^2.23.4) są **devDependencies** — wszystkie wywołania przez `npx wrangler ...` / `npx supabase ...`, żadnych instalacji globalnych. Dzięki temu wersja CLI jest przypięta w `package-lock.json` i identyczna u każdego i w CI.
- `gh` CLI zainstalowany systemowo, zalogowany (scope `repo` + `workflow`) — potrzebny do `gh secret set` i obserwacji runów.

### Uwierzytelnianie CLI (kto, czym, gdzie)

| CLI | Metoda auth | Zakres użycia |
| --- | --- | --- |
| `wrangler` (lokalnie) | OAuth (`npx wrangler login`, sesja już aktywna) | pierwszy ręczny deploy, `secret put`, `tail`, `rollback` |
| `wrangler` (CI) | token API z szablonu **"Edit Cloudflare Workers"**, zawężony do jednego konta | wyłącznie job `deploy` w GitHub Actions |
| `supabase` | `SUPABASE_ACCESS_TOKEN` (`sbp_...`) jako zmienna środowiskowa sesji — **nie** `supabase login` (zapisałby token na dysku) | tworzenie projektu, odczyt kluczy API, PATCH config/auth |
| `gh` | istniejąca sesja `gh auth login` | sekrety repo, `gh run watch` |

- Weryfikacja przed startem: `npx wrangler whoami` (konto `1919e6bc...fc53`), `npx supabase orgs list` (token działa), `gh auth status`.
- Token Supabase żyje tylko w bieżącej sesji PowerShell (`$env:SUPABASE_ACCESS_TOKEN`); po zakończeniu prac shell zamykamy (patrz Phase 6). Tokeny nigdy nie trafiają do plików w repo.

### Rozdział sekretów: dev vs prod vs CI

- **Lokalny dev**: `.dev.vars` (gitignored) — czyta go `wrangler dev`; wzorzec nazw w `.env.example` (`SUPABASE_URL`, `SUPABASE_KEY`).
- **Produkcja (Worker)**: sekrety runtime przez `npx wrangler secret put` — nie w `wrangler.jsonc` ani w buildzie (schema env w `astro.config.mjs` ma `optional: true`, więc build przechodzi bez nich).
- **CI**: GitHub Actions secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL`, `SUPABASE_KEY`) przez `gh secret set` — pipeline nigdy nie widzi tokena OAuth użytkownika.

### Założenia konfiguracji Supabase

- **Hostowany projekt** (nie lokalny stack `supabase start`): region `eu-central-1` (Frankfurt), tworzony przez CLI (`projects create`), nie klikany w dashboardzie — powtarzalność i audytowalność.
- Klucz API: nowy format **`sb_publishable_...`** (następca anon key, właściwy dla `@supabase/ssr`); klucz `service_role`/`sb_secret` **nieużywany** — MVP nie ma operacji administracyjnych.
- Auth: potwierdzanie e-mail **wyłączone** (`mailer_autoconfirm: true` przez Management API) — parytet z lokalnym `config.toml` (`enable_confirmations = false`); bez tego signup na produkcji blokuje się na mailu.
- **Nie** synchronizujemy lokalnego `config.toml` z chmurą (`supabase config push` zabronione) — dev-owy `site_url` nadpisałby hostowaną konfigurację. Konfiguracja chmury zmieniana punktowo przez PATCH Management API.
- Baza: brak własnych migracji w MVP (aplikacja używa tylko `auth.users`) — `supabase db push` nie jest częścią tego wdrożenia; wejdzie do gry razem z pierwszą migracją domenową.
- URL-e auth po deployu: `site_url` = live URL Workera, `uri_allow_list` obejmuje `workers.dev` i localhosty (Phase 6).

## Phase 0 — Preflight: lokalny build + wrangler dev

- [x] `npm ci`; potem `npx astro build` **bez** env Supabase (dowód, że `optional: true` działa)
- [x] `.dev.vars` istnieje (jeśli brak: skopiuj z `.env.example`)
- [x] `npx wrangler dev` → `GET localhost:8787/` = 200, `GET /dashboard` = 302 (redirect do signin)
- [x] Fallback: błędy CommonJS/workerd → sprawdź winny pakiet; `env.ASSETS` undefined → binding `ASSETS` już jest w `wrangler.jsonc`

**Wykonano 2026-07-23.** Ustalenia z przebiegu:

- Build początkowo padał fatalnie z `write EOF` przy starcie optymalizatora deps SSR — przyczyną nie był Astro, tylko **workerd.exe** (spawnowany przez `@cloudflare/vite-plugin`), który nie ładował się z powodu braku `MSVCP140_ATOMIC_WAIT.dll`. Naprawa: instalacja **Microsoft VC++ Redistributable 2015+ x64** (winget). Workerd 2026-05-07 działa, build przechodzi w ~27 s.
- Odchyłka od założeń: lokalny Node to **24.16.0** (brak nvm/fnm na maszynie), `.nvmrc` mówi 22.14.0 — CI pozostanie na 22.14.0 przez setup-node; lokalnie build i dev działają na 24.
- Warning nieblokujący: `@astrojs/sitemap` pominięty, bo `astro.config.mjs` nie ma opcji `site` — do ustawienia po poznaniu live URL (kandydat do Phase 6).
- `wrangler dev` potwierdził binding `env.SESSION` (KV, local) — gotcha #15802 realna, pierwszy deploy musi być lokalny zgodnie z planem.

## Phase 1 — Projekt Supabase cloud (eu-central-1)

- [x] **HUMAN**: token dostępu na https://supabase.com/dashboard/account/tokens + hasło DB (menedżer haseł)
- [x] `$env:SUPABASE_ACCESS_TOKEN = "sbp_..."` (human wkleja); `npx supabase orgs list`
- [x] ~~`npx supabase projects create ...`~~ — **pominięte**: użyto istniejącego projektu (patrz ustalenia)
- [x] `npx supabase projects list` → REF; `npx supabase projects api-keys --project-ref <REF>` → klucz **`sb_publishable_...`**
- [x] Wyłącz potwierdzanie e-mail: PATCH `https://api.supabase.com/v1/projects/<REF>/config/auth` z `{"mailer_autoconfirm": true}` (alternatywa HUMAN: dashboard → Authentication → Email → "Confirm email" OFF)
- [x] Weryfikacja: `GET https://<REF>.supabase.co/auth/v1/health` zdrowy; GET config/auth pokazuje `mailer_autoconfirm: true`
- [x] NIE uruchamiać `supabase config push` (lokalny config.toml z dev-owym `site_url` nadpisałby hostowaną konfigurację)
- [x] Fallback: nie był potrzebny

**Wykonano 2026-07-23.** Ustalenia z przebiegu:

- **Odchyłka od planu (decyzja usera)**: zamiast tworzyć `stable-booksy` w `eu-central-1`, użyto **istniejącego projektu utworzonego ręcznie w dashboardzie**: „lukasz-tolpa's Project", org `vsrfvffqdcxexapxnrrq`, **REF `yghtipqggvpckhlkalsa`**, region **West EU (Ireland / eu-west-1)**. Różnica latencji pomijalna dla MVP; nazwę można zmienić w dashboardzie.
- Klucz aplikacji: `SUPABASE_URL=https://yghtipqggvpckhlkalsa.supabase.co`, `SUPABASE_KEY=sb_publishable_wSHe6ce1rOxPbTFzTrhPOQ_xAkcpqWa` (potwierdzony przez `projects api-keys` — zgodny z tym, co user wygenerował w dashboardzie). Klucze `service_role`/`sb_secret` istnieją, ale zgodnie z założeniami nieużywane.
- `mailer_autoconfirm: true` ustawione przez Management API i zweryfikowane GET-em; auth health OK (GoTrue v2.193.1). `site_url` na razie `http://localhost:3000` — do zmiany na live URL w Phase 6.
- Skan changelogu Supabase (skill supabase): brak breaking changes dot. Management API config/auth, publishable keys i CLI api-keys.
- Uwaga poboczna: hasło DB trafiło do chatu — opcjonalna rotacja po wdrożeniu (Settings → Database → Reset password). CLI zgłasza nowszą wersję (v2.109.1 vs lokalne v2.98.2) — bez wpływu na przebieg.

## Phase 2 — Szlif konfiguracji Workera

- [x] `wrangler.jsonc`: `"name": "10x-astro-starter"` → `"stable-booksy"` (jedyna zmiana)
- [x] `.dev.vars`: realne `SUPABASE_URL=https://yghtipqggvpckhlkalsa.supabase.co` i `SUPABASE_KEY=sb_publishable_...`
- [x] Weryfikacja: `npx wrangler deploy --dry-run` przechodzi czysto (ta wersja wranglera nie drukuje nazwy w dry-run; nazwa zweryfikowana w `wrangler.jsonc`). Bindingi: `SESSION` (KV), `IMAGES`, `ASSETS`.

**Wykonano 2026-07-23.**

## Phase 3 — Pierwszy ręczny deploy + smoke test

- [x] `npx astro build`; `npx wrangler deploy` → **URL: `https://stable-booksy.tolpa-lukasz97.workers.dev`**, wersja `6d597210`; KV `SESSION` doprowizjonowany automatycznie bez promptu (`stable-booksy-session`, id `e286c52f451647b290775c29763420dd`)
- [x] Sekrety runtime: `SUPABASE_URL` i `SUPABASE_KEY` wgrane przez `wrangler secret put`, potwierdzone `secret list`
- [x] Smoke test curl: `/` = 200, `/dashboard` = 302→signin, `/auth/signin` = 200, POST signup = 302, POST signin = 302 + cookie sesji, `/dashboard` z sesją = 200
- [ ] **HUMAN**: pełny flow w przeglądarce — signup → signin → dashboard → signout
- [x] Fallback (`wrangler tail`) użyty do diagnozy — patrz ustalenia

**Wykonano 2026-07-23 (poza krokiem HUMAN).** Ustalenia z przebiegu:

- **Pierwsza próba deployu była częściowo felerna z winy builda**: `astro build` padł na `EPERM` przy czyszczeniu `dist/` (lock trzymały osierocone procesy workerd/node po `wrangler dev` z Phase 0), a wrangler mimo to wypchnął STARĄ paczkę — pod starą nazwą `10x-astro-starter`, bo **wrangler czyta wygenerowany `dist/server/wrangler.json`** (redirect w `.wrangler/deploy/config.json`), nie ręcznie edytowany `wrangler.jsonc`. Wniosek na przyszłość: **nazwa Workera w deployu pochodzi z artefaktu builda — po zmianie `name` trzeba przebudować**; przed buildem upewnić się, że `wrangler dev` nie zostawił procesów (Windows: `Get-Process workerd`).
- Sprzątnięto artefakty: Worker `10x-astro-starter` usunięty, osierocony KV `10x-astro-starter-session` (id `f1fb48ec...`) usunięty.
- Pierwsza próba zgłosiła też brak subdomeny workers.dev — **fałszywy alarm** (subdomena `tolpa-lukasz97.workers.dev` istniała); retry przeszedł bez zmian.
- Smoke test: endpoint signup przyjmuje **FormData, nie JSON** (500 + TypeError przy JSON — to zachowanie projektowe endpointu, nie bug wdrożenia), oraz wymaga nagłówka `Origin` zgodnego z hostem (CSRF checkOrigin Astro → 403 bez niego). Poprawny test: `curl --data-urlencode` + `-H "Origin: <live URL>"`.
- `mailer_autoconfirm` potwierdzony w praniu: signup → natychmiastowy signin bez potwierdzania maila. Konto testowe `smoke-test-claude@example.com` do usunięcia w Phase 6.

## Phase 4 — Naprawa CI + auto-deploy

- [x] **HUMAN**: token Cloudflare API z szablonu **"Edit Cloudflare Workers"**, zawężony do konta `1919e6bc...fc53` — dostarczony (format `cfut_...`), zweryfikowany przez `GET /user/tokens/verify` (status: active)
- [x] `gh secret set` × 4: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL`, `SUPABASE_KEY`
- [x] `.github/workflows/ci.yml`: triggery `master` → `main`; job `ci` przełączony na `node-version-file: .nvmrc`; dopisany job `deploy` (`needs: [ci]`, tylko push na `main`, wrangler-action@v3)
- [x] README: sekcja Deployment zaktualizowana (live URL, auto-deploy, rollback/tail, notka o nazwie z artefaktu builda)
- [x] Commit + push na `main` (AGENTS.md i infrastructure.md były już scommitowane wcześniej — w commicie tylko realne zmiany)
- [x] Weryfikacja: `gh secret list` pokazuje 4 sekrety
- [ ] Fallback: pre-commit lint czerwony → naprawić lint, nie omijać

**Wykonano 2026-07-23.**

## Phase 5 — Weryfikacja pipeline'u end-to-end

- [ ] `gh run list --limit 3` → `gh run watch <RUN_ID>` dla runu z pusha Phase 4
- [ ] Weryfikacja: run `success`; log deploy job zawiera `Deployed stable-booksy`; `npx wrangler deployments list` pokazuje wersję z API tokena (nie OAuth usera); `GET /` = 200
- [ ] Fallback: błąd 10000/authentication → zły szablon tokena, wygenerować ponownie; CI wisi na KV provisioning → dopisać istniejący namespace do `wrangler.jsonc` (`kv_namespaces`, id z `npx wrangler kv namespace list`) i re-push

## Phase 6 — Hardening po wdrożeniu

- [ ] PATCH config/auth Supabase: `site_url` = live URL, `uri_allow_list` = `https://stable-booksy.<sub>.workers.dev/**,http://localhost:3000/**,http://127.0.0.1:3000/**` (alternatywa HUMAN: dashboard → Authentication → URL Configuration)
- [ ] Próba rollbacku (wymóg kontraktu): `npx wrangler deployments list` → `npx wrangler rollback <VERSION_ID>` → strona dalej działa → roll-forward (`npx wrangler deploy`)
- [ ] Observability: `npx wrangler tail` przy klikaniu po signin/dashboard — logi płyną
- [ ] **HUMAN**: regresja auth w przeglądarce na produkcji (świeży signup z realną skrzynką → bez blokady potwierdzenia → dashboard → signout/signin)
- [ ] Sprzątanie: usuń usera smoke-test (dashboard, HUMAN); zamknij shell z `SUPABASE_ACCESS_TOKEN`; `git status` — `.dev.vars` nadal untracked

## Pliki krytyczne

- `wrangler.jsonc` — zmiana `name` na `stable-booksy`
- `.github/workflows/ci.yml` — triggery `master`→`main` + job `deploy` (wrangler-action@v3)
- `.dev.vars` — lokalne sekrety (gitignored, nie commitować)
- `astro.config.mjs` — tylko referencja; schema env musi zostać `optional: true`
- `README.md` — opcjonalna sekcja Deployment

## Weryfikacja końcowa (definition of done)

Aplikacja odpowiada 200 na `https://stable-booksy.<sub>.workers.dev/`; pełny flow auth działa na produkcji; push do `main` przechodzi zielono przez lint+build i automatycznie deployuje przez scoped token; rollback przećwiczony.
