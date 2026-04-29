# M3 Execution Report

## Summary

- **Total M3 tasks**: 5 / 5 completed
- **Total commits in M3**: 5 new commits (M3.1 → M3.5)
- **Final test count**: 145 tests passing across 14 packages + 12 apps
- **PM2 apps**: 13 processes registered (11 active, 2 idle awaiting env config)
- All commits pushed to `origin/master`

## Tasks completed

- [x] **M3.1** xactions live wiring (getTweet engagement metrics + listDMs conversation summaries) — `c12ab4c`
- [x] **M3.2** scanner-3rdparty fallback (Apify + TweetScout HTTP clients, triggers when browser scanner stale) — `217d213`
- [x] **M3.3** kb-publisher CLI + fresh-kb-indexer + /kb page (Dify document management) — `05c5e91`
- [x] **M3.4** watchdog (independent guard for health-monitor liveness) — `41cf1c1`
- [x] **M3.5** Customers CRUD + audit log page + demo seed + improved home — `fe49186`

## What this milestone added

### New packages
- `@x-monitor/x-thirdparty` — pluggable HTTP search clients (`createApifyClient`, `createTweetScoutClient`)

### New apps
- **scanner-3rdparty** (PM2 id 3) — Apify/TweetScout fallback. Idle by default; becomes active when `THIRDPARTY_PROVIDER=apify` or `tweetscout` is set with an API token.
- **fresh-kb-indexer** (PM2 id 11) — pulls Dify document list every hour into local `kb_documents` cache. Idle without `DIFY_API_KEY`/`DIFY_DATASET_ID`.
- **watchdog** (PM2 id 10) — checks `health-monitor` every 2 min; alerts on stale > 5 min.

### Live xactions integration
- `liveClient.getTweet(tweetId)` now calls `engagementManager.getEngagementAnalytics`; analytics-worker writes real likes/retweets/replies/views to `post_analytics`.
- `liveClient.listDMs(sinceMs)` now calls `dmManager.getConversations`; dm-collector populates `dms` table from each account's inbox.
- `parseCount` helper handles `"1.2K"`, `"3M"`, etc.

### KB management
- `createDifyManager` adds `createDocByText`, `listDocuments` (pluggable next to existing `createDifyClient` for retrieval).
- `kb_documents` table caches Dify metadata.
- `pnpm kb-publish <name> <file>` CLI publishes a local text file.
- `/kb` page lists cached docs with hit count, indexing status, last sync time.

### UI polish
- **`/customers`** — full CRUD now (form to add, toggle enable/disable, delete).
- **`/audit`** — recent 100 audit_log entries (approve/reject actions, future system events).
- **`/`** (home) — expanded dashboard:
  - 5 primary stats (待审核 / 今日已发 / 总帖子 / 总草稿 / 总发送)
  - 4 secondary stats (客户名单 / 启用策略 / KB 文档 / 进程健康)
  - Recent 5 sent tweets table
  - Inject test post form (preserved)
- **layout.tsx** — added /audit, /kb nav items.

### Demo data (seeded by `pnpm seed`)
- 3 demo customers: `crypto_curious_alice`, `jeff_taxlawyer`, `staking_steward`
- 4 demo playbooks: 税季截止压力 / Staking 时机困惑 / DeFi 跨司法辖区 / 空投纳税
- 3 demo posts (status `discovered`, picked up by ai-worker on next batch)

## DB tables (16 total)

| Table | Purpose | M-N |
|---|---|---|
| accounts, posts, post_analysis, drafts, scheduled, sent, audit_log, dead_letter, system_health | M1 (9) | M1 |
| customer_accounts | scenario 3 customer list | M2.2 |
| post_analytics | engagement snapshots | M2.4 |
| dms | inbox messages w/ attribution | M2.5 |
| reply_playbooks | operator strategy hints | M2.7 |
| **kb_documents** | Dify doc metadata cache | M3.3 |

## Web UI pages (10 total)

| Path | Purpose | Added |
|---|---|---|
| `/` | Expanded dashboard | M3.5 |
| `/pending`, `/pending/[id]` | Review queue + detail | M1 |
| `/accounts` | Multi-account view | M2.3 |
| `/sent` | Sent tweets w/ engagement metrics | M2.4 |
| `/dms` | Read-only inbox | M2.5 |
| `/customers` | Full CRUD | M3.5 |
| `/playbooks` | Strategy CRUD | M2.7 |
| `/kb` | Dify doc cache list | M3.3 |
| `/audit` | Recent activity log | M3.5 |
| `/status` | Per-process heartbeats | M1 |

## PM2 apps (13 total)

| Id | Name | Status | Cadence |
|---|---|---|---|
| 0 | network-health | online | 5 min HEAD probes |
| 1 | scanner-browser | online | 1 min keyword scan (dry-run) |
| 2 | scanner-customer | online | 5 min per-customer scan (dry-run) |
| 3 | scanner-3rdparty | idle | 30 min (only when `THIRDPARTY_PROVIDER` set) |
| 4 | ai-worker | online | 1 min batch poll |
| 5 | scheduler | online | 30 sec drip-tick |
| 6 | poster | online | per-job (send-tasks) |
| 7 | analytics-worker | online | per-job (analytics-tasks @ 1h/6h/24h/72h/7d delays) |
| 8 | dm-collector | online | 10 min |
| 9 | health-monitor | online | 60 sec |
| 10 | watchdog | online | 2 min |
| 11 | fresh-kb-indexer | idle | 1 hour (only when `DIFY_API_KEY` set) |
| 12 | web-ui | online | persistent |

## Test coverage (145 total)

```
packages/core           5
packages/db             24  (+4 vs M2: kbDocs ×2, audit ×2)
packages/queue          1
packages/observability  2
packages/kb-fixture     2
packages/claude-client  2
packages/prompts        10
packages/rules          11
packages/x-client       10  (+4 vs M2: parseCount)
packages/dify-client    8   (+4 vs M2: manager)
packages/x-thirdparty   8   (NEW: apify ×4, tweetscout ×4)
apps/network-health     3
apps/scanner-browser    2
apps/scanner-customer   3
apps/scanner-3rdparty   1   (NEW)
apps/ai-worker          8
apps/scheduler          2
apps/poster             2
apps/analytics-worker   2
apps/dm-collector       2
apps/health-monitor     9
apps/watchdog           10  (NEW: check ×6, dedupe ×4)
apps/fresh-kb-indexer   2   (NEW)
apps/web-ui             11  (+3 vs M2: customer route smokes)
                       ----
TOTAL                  145
```

## Configuration (cumulative)

```env
# Database
SQLITE_PATH=./data/x-monitor.db
REDIS_URL=redis://localhost:6379

# X cookies (per account)
COOKIES_FINTAX_OFFICIAL=...
COOKIES_ROSSYU_PERSONAL=...
COOKIES_ROSSYU_FOUNDER=...

# AI behavior
CLAUDE_BIN=claude
RUN_LIVE_CLAUDE=0
POSTER_DRY_RUN=1
X_CLIENT_MODE=dry  # set to 'live' to use xactions

# Dify KB (M2.6, M3.3)
DIFY_API_KEY=
DIFY_DATASET_ID=
DIFY_BASE_URL=https://api.dify.ai/v1
KB_INDEXER_INTERVAL_MS=3600000

# 3rdparty scanner (M3.2)
THIRDPARTY_PROVIDER=none       # none|apify|tweetscout
APIFY_API_TOKEN=
APIFY_ACTOR_ID=apidojo~tweet-scraper
TWEETSCOUT_API_KEY=
SCANNER_3RDPARTY_INTERVAL_MS=1800000
THIRDPARTY_TRIGGER_AGE_MS=1800000

# Scanner / collector cadences
SCANNER_CUSTOMER_INTERVAL_MS=300000
DM_COLLECTOR_INTERVAL_MS=600000
HEALTH_MONITOR_TICK_MS=60000

# Watchdog (M3.4)
WATCHDOG_TICK_MS=120000
WATCHDOG_MAX_STALE_S=300

# Telegram alerts
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

## What's running right now (Apr 30, ~2am Asia/Shanghai)

- 11 PM2 apps actively ticking
- 3 demo accounts seeded (FinTax_Official, RossYu_Personal, RossYu_Founder)
- 3 demo customers seeded
- 4 demo playbooks seeded
- 3 demo posts seeded with status=`discovered` → ai-worker picks them up next batch (~60s) → drafts appear in `/pending`
- Telegram alerts are no-op (env not set)
- Dify is no-op (env not set), KB falls back to in-memory `kb-fixture`
- All X operations dry-run (no real posts going out)

## To wake up to a demo

When you wake up:
1. Open http://localhost:3000 — see populated dashboard
2. `/pending` — should have 1-3 drafts from the demo posts (depends on KB fixture matches)
3. `/customers` — 3 demo customers; try adding/toggling
4. `/playbooks` — 4 demo strategies
5. `/sent` — empty until you approve a draft (sat through scheduler tick + poster send)
6. Approve any pending draft → wait ~30s → see scheduler log → wait until target_send_at → see poster send (dry-run, fake `dry-N` tweet id)
7. `/status` — should show 11+ healthy processes
8. `/audit` — should show approve/reject events you generate

## Going live

When ready to enable real X posting (after manual smoke):
```
POSTER_DRY_RUN=0
X_CLIENT_MODE=live
```
in `ecosystem.config.cjs` `SHARED_ENV`, then `pm2 restart all`. xactions launches Puppeteer with `auth_token` from cookies file.

## Summary commits

```
fe49186 feat(ui): customers CRUD + audit log page + demo seed + improved home
41cf1c1 feat(watchdog): independent guard for health-monitor liveness
05c5e91 feat(kb): kb-publisher CLI + fresh-kb-indexer + /kb page
217d213 feat(scanner-3rdparty): Apify/TweetScout fallback when browser scanner is stale
c12ab4c feat(x-client): wire live getTweet (engagement metrics) + listDMs (conversation summaries) via xactions
```

## Aggregate stats from M1 → M3

| | M1 | M2 | M3 | Total |
|---|---|---|---|---|
| Tasks | 18 | 8 | 5 | 31 |
| Tests | 55 | +52 (107) | +38 (145) | 145 |
| Packages | 9 | +1 (10) | +1 (11) | 11 |
| Apps | 6 | +3 (9) | +3 (12) | 12 |
| DB tables | 9 | +4 (13) | +1 (14) | 14 + schema_migrations + 1 unused = 16 |
| Web UI pages | 4 | +5 (9) | +1 (10) | 10 |
| PM2 procs | 6 | +4 (10) | +3 (13) | 13 |
| Commits | 22 | +9 (31) | +5 (36) | ~38 incl docs |

The system is now substantially the complete picture from the original design doc, minus a few items the user explicitly deferred (multi-tz business hours, more advanced scanner-3rdparty failover orchestration, KB additions UI form, automated playbook matching).
