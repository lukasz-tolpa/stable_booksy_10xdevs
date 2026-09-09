<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Quality Gates and the Per-Edit Agent Loop

- **Plan**: context/changes/testing-quality-gates-and-agent-loop/plan.md
- **Scope**: Phases 1–5 of 5 (full plan)
- **Date**: 2026-09-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 6 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Automated success criteria re-run at review time (all green): `core.hooksPath`, `npm run check`, `npm test`, `npm run lint`, hook handler on a covered / uncovered / generated / non-risk file and the exit-2 sabotage, no `deploy` job in ci.yml, rules on `main`, live ruleset == committed file, Prettier on the docs, repo public, PR #12 and #13 merged.

## Findings

### F1 — spawnSync in the hook has no timeout; a hung child becomes an orphan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .claude/hooks/post-edit.mjs:49-53
- **Detail**: The 60 s in settings.json kills only the hook process; on Windows the grandchild (vitest/prettier) survives and the agent sees a generic "hook timed out" instead of the step name. §6.6 budget is ≤ 5 s.
- **Fix**: `timeout: 25_000, killSignal: "SIGKILL"` on spawnSync; ETIMEDOUT flows into the existing throw → exit 1 naming the step.
- **Decision**: FIXED — spawnSync timeout 25 s + SIGKILL

### F2 — Missing node_modules becomes a blocking "prettier failed" (exit 2)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .claude/hooks/post-edit.mjs:86-100
- **Detail**: `node …/prettier.cjs` without installed dependencies exits 1 ("Cannot find module"), `result.error` is unset, so it is routed to `fail()` → exit 2. An environment problem disguised as a formatting failure.
- **Fix**: `existsSync` guard on both binaries → stderr note + exit 1 (hook error, non-blocking).
- **Decision**: FIXED — existsSync guard on prettier/vitest binaries → stderr + exit 1

### F3 — Stale comment in ci.yml: "deploy czeka na oba"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: .github/workflows/ci.yml:30
- **Detail**: The db-tests comment still describes the removed deploy job and contradicts the new comment at lines 100–103 — the "documented ≠ enforced" class this change set out to remove.
- **Fix**: "Rownolegle do `ci`; oba sa wymaganymi checkami w rulesecie `main`."
- **Decision**: FIXED — comment rewritten (ruleset instead of deploy)

### F4 — `prepare: husky` breaks installs without devDependencies

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: package.json:19
- **Detail**: `prepare` runs unconditionally; `npm ci --omit=dev` / `NODE_ENV=production` fails with "husky: command not found" (127). Works today (Actions and Workers Builds install devDependencies) but is one setting away from breaking the production build.
- **Fix**: `"prepare": "husky || true"` (Husky's CI/Docker pattern); `HUSKY=0` still disables hooks deliberately.
- **Decision**: FIXED — prepare: husky || true

### F5 — Minor hook hardening (four one-liners)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: .claude/hooks/post-edit.mjs:82,112-124; .claude/settings.json:5
- **Detail**: (a) `process.exit()` right after stdout/stderr writes — pipe writes are async on Windows; ≤ 4 KB arrives today, `process.exitCode` removes the risk. (b) `relative.startsWith("..")` also matches `..hidden.ts` (safe direction). (c) matcher `Write|Edit` is unanchored (also fires for NotebookEdit / MCP tools containing "Edit"; harmless). (d) the fallback keys on the literal "No test files found" — a Vitest rewording would silently disable it; §6.6 lacks the sabotage "edit a `src/pages/api` file → additionalContext note appears".
- **Fix**: exitCode instead of exit; `relative === ".." || startsWith("../")`; `^(Write|Edit)$`; sabotage line in §6.6.
- **Decision**: FIXED — exitCode, `..` check, anchored matcher, §6.6 sabotage line

### F6 — lint-staged glob lacks `.mjs`: edits to the hook itself skip pre-commit

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: package.json:70-73
- **Detail**: `*.{ts,tsx,astro}` misses `.claude/hooks/post-edit.mjs` and `supabase/tests/run_all.mjs`; only `eslint .` in CI catches them.
- **Fix**: `*.{ts,tsx,mjs,astro}` → `eslint --fix`.
- **Decision**: FIXED — lint-staged glob includes mjs

### F7 — Two EXTRA changes without a trace in the plan notes

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Scope Discipline
- **Location**: tsconfig.json:3; .github/rulesets/main-gates.json:25
- **Detail**: `include: ".claude/hooks/*.mjs"` (the plan anticipated an ESLint `ignores` tweak) and `allowed_merge_methods: ["merge"]` (history-style decision) are described in §6.6 / the hook header but not in the Phase 2 / Phase 4 notes. Test-plan §3 still shows "change opened" — owned by the `/10x-test-plan` orchestrator, not this change.
- **Fix**: one sentence in the Phase 2 and Phase 4 notes of plan.md; leave §3 to the orchestrator after archive.
- **Decision**: FIXED — notes added to plan.md Phase 2 and Phase 4; §3 left to /10x-test-plan

### F8 — Unused CLOUDFLARE\_\* secrets in GitHub

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: GitHub → Settings → Secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID)
- **Detail**: No workflow reads them; a deploy-scoped token is pure attack surface.
- **Fix**: `gh secret delete CLOUDFLARE_API_TOKEN` and `…ACCOUNT_ID` (owner's call; the token can also be revoked in Cloudflare).
- **Decision**: FIXED — CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID deleted from GitHub secrets (token revocation in Cloudflare left to the owner)

### F9 — Ruleset gate strength: no `integration_id`, `strict: false`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — deliberate trade-off for a solo repo
- **Dimension**: Architecture
- **Location**: .github/rulesets/main-gates.json:29-34
- **Detail**: Any app with `checks: write` can satisfy a check named `ci`; a PR can merge without being up to date with main. Reasonable with one author; pin `integration_id: 15368` (GitHub Actions) once collaborators or apps appear.
- **Fix**: none now; one sentence under "Gotchas" in §6.6.
- **Decision**: ACCEPTED — no ruleset change; guidance added to §6.6 gotchas

### F10 — Message language and the hook header

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: .claude/hooks/post-edit.mjs:15,63,110
- **Detail**: `run_all.mjs` speaks Polish (`BLAD: …`), the hook English — the reader is the agent and AGENTS.md is English, so defensible, but a convention split. The header's "lintowany typowo" holds only via ESLint `projectService` (Astro's tsconfig has `allowJs`, not `checkJs`).
- **Fix**: keep English (say why in the comment); reword the header to "lintowany typowo przez ESLint (projectService)".
- **Decision**: FIXED — header comment clarified (ESLint projectService, allowJs without checkJs) and English messages justified
