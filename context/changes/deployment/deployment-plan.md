# Deploy Stable Booksy → Cloudflare Workers + Supabase Cloud

## Context

Lekcja 5 (Plan Mode deploy): pierwsze wdrożenie MVP zgodnie z `context/foundation/infrastructure.md` (platforma: Cloudflare Workers, free tier) i `tech-stack.md` (Astro 6 + Supabase, auto-deploy-on-merge przez GitHub Actions). Decyzje użytkownika: **założyć nowy hostowany projekt Supabase (eu-central-1/Frankfurt)** oraz **pełny zakres** — ręczny pierwszy deploy + naprawa CI i auto-deploy na merge do `main`.

Stan repo (zbadany): `wrangler.jsonc` już poprawnie celuje we Workers (`main` + `assets` + `nodejs_compat`) — obawa o stary config Pages nie dotyczy. Sekrety czytane przez typowane `astro:env/server` (`SUPABASE_URL`, `SUPABASE_KEY`, `optional: true`) — wzorzec runtime'owy, zweryfikowany w docs Astro: NIE są inline'owane w build. CI (`.github/workflows/ci.yml`) triggeruje na `master`, a gałąź to `main` — CI martwe; brak kroku deploy i tokena Cloudflare. Brak migracji Supabase (app używa tylko `auth.users`). Wszystko SSR (zero `prerender`). Wrangler 4.90.0 (devDep), zalogowany OAuth; `gh` zalogowany (scope repo+workflow).

Fakty zweryfikowane w sieci (2026-07-20): nowe projekty Supabase wydają klucze `sb_publishable_...` (zamiennik anon, właściwy dla `@supabase/ssr`); hostowane projekty mają potwierdzanie e-mail **włączone domyślnie** (konflikt z lokalnym `enable_confirmations = false` i stroną confirm-email auto-potwierdzającą tylko w DEV) — trzeba wyłączyć (`mailer_autoconfirm: true`); wzorzec CI: `cloudflare/wrangler-action@v3` + token z szablonu "Edit Cloudflare Workers"; gotcha adaptera ([withastro/astro#15802](https://github.com/withastro/astro/issues/15802)): adapter może wstrzyknąć binding KV `SESSION` i wrangler interaktywnie provisionuje namespace — dlatego pierwszy deploy MUSI być lokalny, żeby CI nigdy nie trafiło na prompt.

## Phase 0 — Preflight: lokalny build + wrangler dev

- [ ] `npm ci`; potem `npx astro build` **bez** env Supabase (dowód, że `optional: true` działa)
- [ ] `.dev.vars` istnieje (jeśli brak: skopiuj z `.env.example`)
- [ ] `npx wrangler dev` → `GET localhost:8787/` = 200, `GET /dashboard` = 302 (redirect do signin)
- [ ] Fallback: błędy CommonJS/workerd → sprawdź winny pakiet; `env.ASSETS` undefined → binding `ASSETS` już jest w `wrangler.jsonc`

## Phase 1 — Projekt Supabase cloud (eu-central-1)

- [ ] **HUMAN**: token dostępu na https://supabase.com/dashboard/account/tokens + hasło DB (menedżer haseł)
- [ ] `$env:SUPABASE_ACCESS_TOKEN = "sbp_..."` (human wkleja); `npx supabase orgs list`
- [ ] `npx supabase projects create stable-booksy --org-id <ORG> --region eu-central-1 --db-password "<PW>"`
- [ ] `npx supabase projects list` → REF; `npx supabase projects api-keys --project-ref <REF>` → klucz **`sb_publishable_...`**
- [ ] Wyłącz potwierdzanie e-mail: PATCH `https://api.supabase.com/v1/projects/<REF>/config/auth` z `{"mailer_autoconfirm": true}` (alternatywa HUMAN: dashboard → Authentication → Email → "Confirm email" OFF)
- [ ] Weryfikacja: `GET https://<REF>.supabase.co/auth/v1/health` zdrowy; GET config/auth pokazuje `mailer_autoconfirm: true`
- [ ] NIE uruchamiać `supabase config push` (lokalny config.toml z dev-owym `site_url` nadpisałby hostowaną konfigurację)
- [ ] Fallback: PATCH 404 → projekt się jeszcze provisionuje, odczekać 2 min; jeśli potwierdzeń nie da się wyłączyć → zostawić ON i dodać workers.dev do Redirect URLs (Phase 6), strona confirm-email w PROD pokazuje instrukcje

## Phase 2 — Szlif konfiguracji Workera

- [ ] `wrangler.jsonc`: `"name": "10x-astro-starter"` → `"stable-booksy"` (jedyna zmiana)
- [ ] `.dev.vars`: realne `SUPABASE_URL=https://<REF>.supabase.co` i `SUPABASE_KEY=sb_publishable_...` (HUMAN wkleja)
- [ ] Weryfikacja: `npx wrangler deploy --dry-run` drukuje nazwę `stable-booksy`

## Phase 3 — Pierwszy ręczny deploy + smoke test

- [ ] `npx astro build`; `npx wrangler deploy` → zapisz URL `https://stable-booksy.<sub>.workers.dev`; jeśli wrangler zapyta o provisioning KV `SESSION` (gotcha #15802) — zaakceptować (po to deploy jest lokalny)
- [ ] Sekrety runtime (HUMAN podaje wartości): `"..." | npx wrangler secret put SUPABASE_URL` i `SUPABASE_KEY` (każdy `secret put` sam wdraża nową wersję)
- [ ] Smoke test curl: `/` = 200, `/dashboard` = 302, `/auth/signin` = 200, POST `/api/auth/signup` działa
- [ ] **HUMAN**: pełny flow w przeglądarce — signup → signin → dashboard → signout
- [ ] Fallback: `npx wrangler tail stable-booksy --format pretty` w drugim terminalu; 500 wszędzie → `npx wrangler secret list` (literówki nazw); signup 4xx → potwierdzenia e-mail nadal ON; błędy limitu CPU (10 ms free) → odnotować, nie stroić w ciemno

## Phase 4 — Naprawa CI + auto-deploy

- [ ] **HUMAN**: token Cloudflare API z szablonu **"Edit Cloudflare Workers"**, zawężony do konta `1919e6bc...fc53`
- [ ] `gh secret set CLOUDFLARE_API_TOKEN` (human wkleja); `gh secret set CLOUDFLARE_ACCOUNT_ID --body "1919e6bc68f42a5dc9152cd0e377fc53"`; `gh secret set SUPABASE_URL --body "https://<REF>.supabase.co"`; `gh secret set SUPABASE_KEY`
- [ ] `.github/workflows/ci.yml`: triggery `master` → `main` (push i pull_request); dopisz job `deploy`:
  `needs: [ci]`, `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`, kroki: checkout → setup-node (`node-version-file: .nvmrc`, cache npm) → `npm ci` → `npx astro build` → `cloudflare/wrangler-action@v3` z `apiToken`/`accountId` z sekretów, `command: deploy` (action użyje wranglera 4.90.0 z repo)
- [ ] (Opcjonalnie) README: sekcja Deployment (URL, `wrangler secret put` / `rollback` / `tail`)
- [ ] Commit + push na `main`: `wrangler.jsonc`, `ci.yml`, README + zaległe `AGENTS.md` i `context/foundation/infrastructure.md`
- [ ] Weryfikacja: `gh secret list` pokazuje 4 sekrety
- [ ] Fallback: pre-commit lint czerwony → naprawić lint, nie omijać

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
