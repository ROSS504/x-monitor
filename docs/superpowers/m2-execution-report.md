# M2 Execution Report

## Summary

- **Total M2 tasks**: 8 / 8 completed
- **Total commits**: 8 new commits (M2.1 → M2.8)
- **Final test count**: 107 tests passing across 12 packages + 9 apps
- **PM2 apps**: 10 processes online (was 6 in M1)
- All commits pushed to `origin/master` on https://github.com/ROSS504/x-monitor

## Tasks completed

- [x] **M2.1** Scenario 2: KB-grounded synthesis for discussion/opinion posts — `43a9b49`
- [x] **M2.2** Scenario 3: customer-account scanner + customer-engagement drafts — `82e4e49`
- [x] **M2.3** Multi-account support (3 accounts) + strategy-based draft routing + accounts page — `d2845aa`
- [x] **M2.4** Post-publish analytics (1h/6h/24h/72h/7d snapshots) — `7224758`
- [x] **M2.5** DM collector (collect inbox + attribute to sent replies) — `4d2d50e`
- [x] **M2.6** Real Dify HTTP KB retrieval with kb-fixture fallback — `8980e65`
- [x] **M2.7** Operator-curated reply playbooks attached to KB-grounded synthesis — `ff302e3`
- [x] **M2.8** health-monitor + Telegram alerts with 30min dedupe — `ab5b3f9`

## New surface area

### Packages (12 total, 3 new)
- `@x-monitor/core` (M1)
- `@x-monitor/db` (M1, +5 new repos: customers, analytics, dms, playbooks; +HealthStatus type export)
- `@x-monitor/queue` (M1, +analytics queue + scheduleAllBuckets)
- `@x-monitor/observability` (M1)
- `@x-monitor/x-client` (M1, +listDMs interface, +TweetMetrics, +DryRunXClient.seedDMs)
- `@x-monitor/claude-client` (M1)
- `@x-monitor/prompts` (M1, +synthesizeReply.ts with optional playbooks input)
- `@x-monitor/rules` (M1, +accountRouting)
- `@x-monitor/kb-fixture` (M1)
- **`@x-monitor/dify-client`** (NEW) — real Dify HTTP retrieval; pluggable `SearchKBFn`

### Apps (9 total, 4 new)
- `network-health` (M1)
- `scanner-browser` (M1, multi-account aware)
- **`scanner-customer`** (NEW) — watches `customer_accounts` table, 2-day window, scenario 3
- `ai-worker` (M1, +scenario 2/3 branches, +playbook injection, +KB DI)
- `scheduler` (M1, multi-account aware)
- `poster` (M1, +schedules analytics buckets on send)
- **`analytics-worker`** (NEW) — drains `analytics-tasks` queue at 1h/6h/24h/72h/7d after send
- **`dm-collector`** (NEW) — every 10 min, pulls each account's inbox, attributes by sender→original-author match
- **`health-monitor`** (NEW) — every 60s, checks all process heartbeats; Telegram alert with 30-min dedupe per `process:kind`
- `web-ui` (M1, +5 new pages: /accounts /sent /dms /customers /playbooks)

### DB tables (15 total, 5 new vs M1's 9)
| Table | Purpose | Added |
|---|---|---|
| accounts, posts, post_analysis, drafts, scheduled, sent, audit_log, dead_letter, system_health | M1 | M1 |
| customer_accounts | scenario 3 customer list | M2.2 |
| post_analytics | 1h/6h/24h/72h/7d snapshots | M2.4 |
| dms | collected inbox messages w/ attribution | M2.5 |
| reply_playbooks | operator strategy hints | M2.7 |

### Web UI pages (8 total)
| Path | Purpose |
|---|---|
| `/` | 概览 — pending count + sent today + inject form |
| `/pending` | 待审核草稿 list |
| `/pending/[id]` | 草稿详情 + 通过/驳回 |
| **`/accounts`** | 账号 list (3 accounts, daily limits, today usage) |
| **`/sent`** | 已发送 list with 1h/6h/24h/72h/7d engagement metrics |
| **`/dms`** | 私信 inbox (read-only) with 关联 to sent_id |
| **`/customers`** | 潜客名单 (read-only for now) |
| **`/playbooks`** | 策略 list + add/toggle/delete CRUD |
| `/status` | 系统状态 — heartbeats per process |

## Test coverage (107 total)

```
packages/core           5
packages/db             20  (+12 vs M1: customers ×3, analytics ×2, dms ×3, playbooks ×4)
packages/queue          1
packages/observability  2
packages/kb-fixture     2
packages/claude-client  2
packages/prompts        10  (+4 vs M1: synthesizeReply ×2 + playbook variants ×2)
packages/rules          11  (+5 vs M1: accountRouting)
packages/x-client       6   (+2 vs M1: postReply→getTweet roundtrip, seedDMs/listDMs)
packages/dify-client    4   (NEW)
apps/network-health     3
apps/scanner-browser    2
apps/scanner-customer   3   (NEW)
apps/ai-worker          8   (+4 vs M1: synthesize ×3, account-routing)
apps/scheduler          2
apps/poster             2
apps/analytics-worker   2   (NEW)
apps/dm-collector       2   (NEW)
apps/health-monitor     9   (NEW)
apps/web-ui             8   (+3 vs M1: 3 new playbooks API smokes)
                       ---
TOTAL                  107
```

## Configuration

### New environment variables
```
# Dify KB (optional; if unset, falls back to in-memory kb-fixture)
DIFY_API_KEY=
DIFY_DATASET_ID=
DIFY_BASE_URL=https://api.dify.ai/v1

# Per-account cookies (M2.3)
COOKIES_FINTAX_OFFICIAL=...
COOKIES_ROSSYU_PERSONAL=...
COOKIES_ROSSYU_FOUNDER=...

# Scanner / collector intervals
SCANNER_CUSTOMER_INTERVAL_MS=300000
DM_COLLECTOR_INTERVAL_MS=600000
HEALTH_MONITOR_TICK_MS=60000

# Telegram alerts (M2.8)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

## Architecture changes

### Strategy-based draft routing
`pickAccountForStrategy(strategy, accounts)`:
- `article-match` (scenario 1) → official
- `kb-synthesis` (scenario 2) → official
- `customer-engagement` (scenario 3) → personal (fallback founder)

### KB injection
`apps/ai-worker/src/kb.ts` is the singleton factory:
- Production: `createDifyClient` if `DIFY_API_KEY` + `DIFY_DATASET_ID` set
- Dev/tests: `kb-fixture`'s `searchKB`
- All consumers (`draftOne`, `synthesizeOne`, `processBatch`) now take `searchKB: SearchKBFn` via DI

### Analytics scheduling
On `sendOne` success → `scheduleAllBuckets` enqueues 5 delayed jobs (1h/6h/24h/72h/7d) → `analytics-worker` consumes each → calls `XClient.getTweet` → upserts `post_analytics` row keyed `(sentId, bucket)`.

### Health alerting
`apps/health-monitor` runs every 60s, classifies each tracked process by `kind`:
- `live` (6 procs): stale threshold = cadence × 3 (5–30 min)
- `event-driven` (3 procs): silence allowed up to 24h (or 1h for ai-routine); fail any time `status='error'`
- Dedupe per `(process, kind)` → max 1 Telegram message per 30 min

## What lives in code (not DB)
Per the user's "patch-friendly" preference:
- Prompts: `packages/prompts/src/*.ts`
- Scanner queries: `apps/scanner-browser/src/index.ts` (queries array)
- Account seeds: `scripts/seed.ts`
- Customer seeds: external (none in code; populate via SQL or future API)
- Playbooks: managed via web-ui (operator data, not config)
- Health thresholds: `apps/health-monitor/src/check.ts` (`PROCESS_EXPECTATIONS`)

## Known gaps / next milestones

### Live mode gaps (xactions wiring incomplete)
- `liveClient.getTweet` returns `null` → analytics-worker only writes rows in dry-run
- `liveClient.listDMs` returns `[]` → dm-collector logs zero new DMs in live mode
Both need additional xactions module integration (engagementManager analytics, dmManager scrape).

### Pre-existing flakiness
- `account-routing.test.ts` and `batch.test.ts` share Redis queues; under heavy parallel test runs they can race. Stable in serial runs.

### Manual ops still required
- Customer account seeding: insert directly into `customer_accounts` table or build an import endpoint
- Per-account cookies: file paths point to `~/twitter_cookies_*.json`; user manages those externally
- Telegram bot token + chat id: set in `.env` to enable alerting (no-op without)

### Design-doc items deferred to M3+
- scanner-3rdparty (Apify/TweetScout HTTP fallback when browser scraper rate-limits)
- kb-publisher / fresh-kb-indexer (push articles into Dify on publish)
- watchdog (separate from health-monitor — detect _the_ monitor itself going down)
- Playbook UI auto-match (today operator picks, AI matches by keyword)
- Multi-tz business hours (currently hardcoded Asia/Shanghai in scheduling.ts)

## End-to-end flow (now)

1. **Discovery**: scanner-browser (keywords) and scanner-customer (customer-list) fetch tweets → posts table → `ai-tasks` queue
2. **Analysis**: ai-worker pulls batch → claude -p classifies scenario (1/2/3/skip)
3. **Drafting**:
   - Scenario 1: KB top-1 article match → claude -p → draft with `strategy='article-match'` → official account
   - Scenario 2: KB top-3 chunks + relevant playbooks → claude -p → draft with `strategy='kb-synthesis'` → official
   - Scenario 3: same as 2 but `strategy='customer-engagement'` → personal/founder
4. **Review**: web-ui /pending → operator clicks 通过 or 驳回
5. **Scheduling**: scheduler tick → `computeTargetSendAt(account, lastSent, todayCount, businessHours)` → `scheduled` table → `send-tasks` queue when due
6. **Sending**: poster → `XClient.postReply` → `sent` table + 5 delayed analytics jobs scheduled
7. **Analytics**: analytics-worker picks up each delayed job → `XClient.getTweet(sentTweetId)` → `post_analytics` upsert by `(sentId, bucket)`
8. **DMs**: dm-collector every 10 min → per account `XClient.listDMs(now-7d)` → `dms` insert with best-effort `attributed_sent_id`
9. **Health**: health-monitor every 60s → `checkHealth(rows, expectations)` → fresh issues → `sendTelegramAlert` (deduped 30 min)
10. **Network gating**: every worker awaits `getNetStatus()` before doing X-touching work; HEALTHY only

## Summary commits

```
ab5b3f9 feat(health-monitor): periodic check + Telegram alerts with 30min dedupe
ff302e3 feat(playbooks): operator-curated reply strategies attached to KB-grounded synthesis
8980e65 feat(dify-client): real Dify HTTP KB retrieval with kb-fixture fallback
4d2d50e feat(dm-collector): collect inbox DMs across accounts + attribute to sent replies
7224758 feat(analytics): post-publish snapshots at 1h/6h/24h/72h/7d
d2845aa feat: multi-account support (3 accounts) + strategy-based draft routing + accounts page
82e4e49 feat(scenario-3): customer-account scanner + customer-engagement drafts
43a9b49 feat(scenario-2): KB-grounded synthesis for discussion/opinion posts
```
