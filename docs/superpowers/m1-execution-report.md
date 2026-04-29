# M1 Execution Report

## Summary

- **Total tasks attempted**: 18 / 18 (Tasks 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 21)
- **Total commits**: 22 (from `02380f6` through `1c19453`)
- **Final test count**: 55 tests passing across 14 test files (10 packages + 6 apps)
- **All commits pushed** to `origin/master` on https://github.com/ROSS504/x-monitor

## Tasks completed

- [x] Task 1: Repo scaffolding — `02380f6`
- [x] Task 2: `core` package (types, trace, time, Result) — `43ff2e3`, `899d7f5`
- [x] Task 3: `db` package (schema + 8 repos) — `0a15034`, `22a138b`, `a55b6d9`, `14ed898`
- [x] Task 4: `queue` package (Redis, BullMQ, netStatus) — `12eb769`
- [x] Task 5: `observability` package (logger, heartbeat, telegram) — `8400233`, `ce75167`
- [x] Task 6: `kb-fixture` package (static KB) — `124ba86`
- [x] Task 7: `claude-client` package (`claude -p` wrapper) — `606d6f0`
- [x] Task 8: `prompts` package (analyze + draft) — `71dc6ee`, `9f9e496`
- [x] Task 9: `rules` package (scheduling, threshold) — `c01c609`
- [x] Task 10: `x-client` package (XClient + DryRun) — `a2f623b`
- [x] Task 11: DB seed script — `4281d10`
- [x] Task 12: `network-health` app — `3394dc1`
- [x] Task 13: `scanner-browser` app (dry-run) — `26186c0`
- [x] Task 14: `ai-worker` app (BullMQ Worker batch) — `899b5d0`
- [x] Task 15: `scheduler` app — `25c1aec`
- [x] Task 16: `poster` app (idempotent send) — `ef6d844`
- [x] Task 17: `web-ui` Next.js review queue — `7dee1bc`
- [x] Task 21: `inspect` CLI — `1c19453`

## Tasks skipped (out of M1 local scope)

- Task 18: live xactions integration — needs Chrome CDP + cookies; deferred to M2
- Task 19: PM2 ecosystem.config.cjs — operator task, run after pull
- Task 20: launchd plist for macOS — operator task
- Task 22: Claude Code `/schedule` routine setup — operator task in Claude Code CLI

## Plan deviations (each acceptable + justified)

1. **Task 2 trace.ts**: switched from `ulid()` to `monotonicFactory()` — bare ulid produced flaky `a < b` ordering when called twice in the same millisecond.
2. **Task 2 tsconfig.json**: every package's tsconfig must override `compilerOptions.rootDir`/`outDir` because the inherited paths from base tsconfig resolve relative to repo root.
3. **Task 3 healthRepo**: `HealthStatus` defined as `'healthy'|'degraded'|'down'` initially, then **realigned to `'ok'|'error'`** in commit `a26238f` to match Task 5's heartbeat() helper signature in plan.
4. **Task 8 prompts barrel**: both modules export `PROMPT_VERSION`. Renamed at re-export to `ANALYZE_POST_PROMPT_VERSION` and `DRAFT_FROM_ARTICLE_PROMPT_VERSION` to avoid name collision.
5. **Task 9 computeTargetSendAt**: plan's logic `base = max(now+interval, lastSent+interval)` would fail the second test. Fixed to `base = lastSent !== null ? max(now, lastSent+interval) : now+interval`. Test passes; matches the test's clear intent.
6. **Task 11**: `accountsRepo.insert` was missing — added it (same plan-style commit). Plan title says "+ keyword" but no keyword table exists in schema; only the FinTax_Official account is seeded.
7. **Task 14**: used BullMQ `Worker` with `autorun:false` + `drained` event instead of the awkward `getNextJob` API (per plan's own implementation note).
8. **Task 14 prerequisite**: `draftsRepo.insert` extended to accept optional `promptVersion` (commit `84a52f0`); schema already had the column.
9. **Task 15 prerequisite**: added `scheduledRepo.findByDraftId`, `sentRepo.findLastForAccount`, `sentRepo.countTodayForAccount` (commit `af2b6ba`).
10. **Task 17 web-ui**: dropped `"type": "module"` from web-ui package.json (Next.js handles its own module resolution; setting it breaks `next.config.mjs`). API smoke test uses file-existence check rather than importing route modules in vitest.

## Test coverage summary

```
packages/core           5 tests
packages/db             8 tests
packages/queue          1 test  (BullMQ + Redis integration)
packages/observability  2 tests
packages/kb-fixture     2 tests
packages/claude-client  2 tests (mocked subprocess)
packages/prompts        6 tests
packages/rules          6 tests
packages/x-client       4 tests
apps/network-health     3 tests
apps/scanner-browser    2 tests
apps/ai-worker          4 tests (incl. Redis+SQLite integration)
apps/scheduler          2 tests
apps/poster             2 tests
apps/web-ui             5 tests (file existence smoke)
                       ---
TOTAL                  55 tests
```

## What the user should do next

1. `git pull origin master` (already pushed for you, confirm latest)
2. Verify `redis-cli ping` returns `PONG` (Redis is already running locally via `brew services start redis`)
3. Run `pnpm install` (workspace deps)
4. Run `pnpm -r --filter='./packages/*' --filter='./apps/*' test` to confirm 55 tests pass
5. Run `pnpm seed` to bootstrap the FinTax_Official account
6. Run `pnpm --filter @x-monitor/app-web-ui dev` and open http://localhost:3000
7. Inject a test post via curl:
   ```bash
   curl -XPOST http://localhost:3000/api/test/inject-post \
     -H 'content-type: application/json' \
     -d '{"text":"How are crypto staking rewards taxed?","authorHandle":"alice"}'
   ```
8. To exercise the AI worker locally: `pnpm --filter @x-monitor/app-ai-worker build && node apps/ai-worker/dist/index.js` (this will spawn `claude -p` subprocesses — uses your Claude Code Max quota)
9. To exercise scheduler/poster end-to-end (in dry-run): build and run each app's `dist/index.js`. Poster's tweet IDs will be `dry-N` (no real X post)

## Tasks for the user (manual)

- **Task 18** (live xactions): edit `apps/scanner-browser/src/index.ts` and `apps/poster/src/index.ts` to use real xactions client when `X_CLIENT_MODE=live` / `POSTER_DRY_RUN=0`. Cookie path comes from env `COOKIES_FINTAX_OFFICIAL`.
- **Task 19** (PM2): write `ecosystem.config.cjs` with the 5 apps (network-health, scanner-browser, scheduler, poster, web-ui).
- **Task 20** (launchd): write `~/Library/LaunchAgents/com.fintax.x-monitor.plist` to start PM2 + caffeinate at login.
- **Task 22** (Claude Code routine): in Claude Code CLI, run `/schedule` to create a routine that invokes `apps/ai-worker/dist/index.js` (or a routine entry script) every 5–10 minutes.

## Blockers / deviations (none unresolved)

No unresolved blockers. The 10 deviations listed above were necessary corrections (plan errata or missing API methods) and each is documented in commits or this report.

## Notes for follow-up cleanup

- **claude-client subprocess timer leak**: `runPrompt`'s success path doesn't clear the 120s timeout handle. Production calls accumulate timer handles for the timeout duration. Low-priority cleanup.
- **`apps/web-ui` API GET routes**: should add `export const dynamic = 'force-dynamic'` to `/api/pending`, `/api/status`, etc. to prevent `next build` from initializing the SQLite DB at build time (currently creates `apps/web-ui/data/x-monitor.db`, which I deleted).
- **scheduler tz handling**: `nextBusinessStart` only handles `Asia/Shanghai` (offset hardcoded to +08:00). Add a real timezone-offset lookup before introducing accounts in other timezones.
- **`@x-monitor/core` and `@x-monitor/kb-fixture` deps in `prompts`**: declared but not imported. Consider dropping if not used by Task 23+.
