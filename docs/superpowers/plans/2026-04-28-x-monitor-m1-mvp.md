# X Monitor — M1 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the smallest end-to-end working slice of the X monitor system: capture tweets for one keyword on one X account, generate a reply draft via Claude Code, review in a web UI, schedule and send the reply, with basic network health monitoring and Telegram alerts.

**Architecture:** TypeScript pnpm monorepo. SQLite (better-sqlite3) for persistence. Redis (BullMQ) for queues. PM2 manages 5 long-running processes plus 1 Claude Code routine. Next.js for the review UI. xactions library + Chrome CDP for X automation. All AI calls go through Claude Code Max via `claude -p` subprocess (and a routine for the worker).

**Tech Stack:** Node.js 20, TypeScript 5, pnpm workspaces, Next.js 14 (App Router), better-sqlite3, ioredis, BullMQ, Vitest, PM2, xactions (existing local package), launchd (macOS), Telegram Bot API.

**Spec:** `docs/superpowers/specs/2026-04-28-x-monitor-design.md` — read this first.

---

## Scope of M1

**In scope:**
- One X account (FinTax_Official)
- One scenario (Scenario 1: article match → draft from KB)
- 6 processes: `scanner-browser`, `ai-worker` (Claude Code routine), `web-ui`, `scheduler`, `poster`, `network-health`
- 9 SQLite tables: `accounts`, `posts`, `post_analysis`, `drafts`, `scheduled`, `sent`, `system_health`, `audit_log`, `dead_letter`
- Redis queues: `ai-tasks`, `send-tasks`
- network-health pub/sub
- Telegram alert on system failure
- PM2 ecosystem.config.cjs + launchd plist
- Inspect CLI: `inspect post <id>`, `inspect health`
- Dry-run mode for poster
- Web UI: pending review queue, approve/reject, system status, single post detail

**Out of scope (deferred to later milestones):**
- Scenarios 2 & 3, multi-account, scanner-3rdparty, customer-sync, kb-publisher, fresh-kb-indexer, analytics-worker, dm-collector, health-monitor, watchdog, Playbook UI, KB additions UI, Dify integration (M1 uses a static fixture for KB), reply playbooks, advanced retry/backoff
- Real Dify calls — M1 uses an in-memory KB fixture so the full pipeline can be tested without external dependencies. Dify HTTP integration ships in M2.

**Working definition of "done" for M1:**
1. `pnpm install && pnpm build && pnpm test` all pass
2. `pnpm dev` starts all 5 PM2 processes plus `web-ui`
3. From the web UI, you can manually inject a test tweet via "Add Test Post" button, watch ai-worker pick it up (running on a 1-minute schedule for dev), see a draft appear in pending review, approve it, watch scheduler queue it, watch poster send it via xactions in dry-run mode (no real X post). End-to-end trace_id appears in logs.
4. Killing Wi-Fi → `network-health` reports DEGRADED → all workers go quiet → restoring Wi-Fi → workers resume without restart.
5. Killing the `poster` process → PM2 auto-restarts it; Telegram alert fires.

---

## File Structure

This monorepo will be created in the brainstorming worktree at `/Users/nightyoung/IdeaProjects/x-monitor`. The final layout for M1:

```
x-monitor/
├── package.json                         # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── .env.example
├── ecosystem.config.cjs                 # PM2 config for all processes
├── launchd/com.fintax.x-monitor.plist   # macOS LaunchAgent
│
├── packages/
│   ├── core/                            # Shared types, domain models, utilities
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── types.ts                 # Post, Draft, Sent, Account, etc.
│   │   │   ├── trace.ts                 # trace_id generator
│   │   │   ├── time.ts                  # date helpers, business hours
│   │   │   └── result.ts                # Result<T,E> type for error returns
│   │   ├── tests/
│   │   │   ├── trace.test.ts
│   │   │   └── time.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── db/                              # SQLite schema, migrations, queries
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── connection.ts            # better-sqlite3 wrapper
│   │   │   ├── schema.sql               # CREATE TABLE statements
│   │   │   ├── migrate.ts               # Migration runner
│   │   │   ├── repos/
│   │   │   │   ├── posts.ts             # postsRepo: insert/findById/updateStatus
│   │   │   │   ├── drafts.ts
│   │   │   │   ├── scheduled.ts
│   │   │   │   ├── sent.ts
│   │   │   │   ├── accounts.ts
│   │   │   │   ├── health.ts
│   │   │   │   ├── audit.ts
│   │   │   │   └── deadLetter.ts
│   │   │   └── seed.ts                  # Initial accounts/keyword seed
│   │   ├── tests/
│   │   │   ├── posts.test.ts
│   │   │   ├── drafts.test.ts
│   │   │   └── migrate.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── queue/                           # Redis queue wrappers
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── connection.ts            # ioredis wrapper
│   │   │   ├── queues.ts                # ai-tasks, send-tasks queue defs
│   │   │   └── netStatus.ts             # network-status pub/sub helpers
│   │   ├── tests/
│   │   │   └── queues.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── observability/                   # Logging, heartbeat, trace
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── logger.ts                # Structured JSON logger
│   │   │   ├── heartbeat.ts             # writes to system_health
│   │   │   └── telegram.ts              # Send alerts via Telegram bot
│   │   ├── tests/
│   │   │   ├── logger.test.ts
│   │   │   └── heartbeat.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── x-client/                        # xactions wrapper for our use cases
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client.ts                # XClient class: search, postReply, getTweet
│   │   │   ├── cookies.ts               # Load cookies from file path
│   │   │   └── dryRun.ts                # In-memory fake X for tests/dry-run
│   │   ├── tests/
│   │   │   ├── dryRun.test.ts
│   │   │   └── client.test.ts           # Uses dryRun fake
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── claude-client/                   # Subprocess wrapper for `claude -p`
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── runPrompt.ts             # spawn `claude -p`, return JSON
│   │   ├── tests/
│   │   │   └── runPrompt.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── prompts/                         # All LLM prompts as TypeScript
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── analyzePost.ts
│   │   │   └── draftFromArticle.ts
│   │   ├── tests/
│   │   │   ├── analyzePost.test.ts
│   │   │   └── draftFromArticle.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── rules/                           # Business rules
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── scheduling.ts            # computeTargetSendAt
│   │   │   └── matchingThreshold.ts     # KB match score thresholds
│   │   ├── tests/
│   │   │   ├── scheduling.test.ts
│   │   │   └── matchingThreshold.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── kb-fixture/                      # Static KB for M1 (replaces Dify)
│       ├── src/
│       │   ├── index.ts
│       │   ├── articles.ts              # Hardcoded English articles
│       │   └── search.ts                # Simple keyword scoring search
│       ├── tests/
│       │   └── search.test.ts
│       ├── package.json
│       └── tsconfig.json
│
├── apps/
│   ├── scanner-browser/
│   │   ├── src/
│   │   │   ├── index.ts                 # Entry: PM2-managed long-running process
│   │   │   ├── scan.ts                  # Single scan iteration
│   │   │   └── loop.ts                  # Main loop with network health gate
│   │   ├── tests/
│   │   │   ├── scan.test.ts
│   │   │   └── loop.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── ai-worker/
│   │   ├── src/
│   │   │   ├── index.ts                 # Entry for Claude Code routine
│   │   │   ├── batch.ts                 # Pull batch from queue, process each
│   │   │   ├── analyze.ts               # Wraps prompt + claude-client
│   │   │   └── draft.ts                 # Wraps prompt + claude-client
│   │   ├── tests/
│   │   │   ├── batch.test.ts
│   │   │   ├── analyze.test.ts
│   │   │   └── draft.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── scheduler/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── tick.ts                  # Single scheduling tick
│   │   ├── tests/
│   │   │   └── tick.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── poster/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── post.ts                  # Single send action
│   │   ├── tests/
│   │   │   └── post.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── network-health/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── probe.ts                 # HEAD probes
│   │   │   └── classify.ts              # Map probe results to status
│   │   ├── tests/
│   │   │   ├── probe.test.ts
│   │   │   └── classify.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web-ui/
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx             # Overview / today stats
│       │   │   ├── pending/page.tsx     # Pending review queue
│       │   │   ├── pending/[id]/page.tsx # Single draft detail + actions
│       │   │   ├── status/page.tsx      # System status
│       │   │   └── api/
│       │   │       ├── pending/route.ts
│       │   │       ├── pending/[id]/approve/route.ts
│       │   │       ├── pending/[id]/reject/route.ts
│       │   │       ├── status/route.ts
│       │   │       └── test/inject-post/route.ts  # Dev-only: manually inject a post
│       │   └── lib/
│       │       └── server.ts            # DB+queue handles for server components
│       ├── tests/
│       │   └── api.test.ts
│       ├── next.config.mjs
│       ├── package.json
│       └── tsconfig.json
│
├── scripts/
│   ├── inspect.ts                       # CLI: post <id>, health, drafts pending
│   ├── seed.ts                          # Initial DB seed (one account, one keyword)
│   └── ai-routine.ts                    # Entry point invoked by Claude Code routine
│
├── tests/
│   ├── e2e/
│   │   └── pipeline.test.ts             # End-to-end: inject → draft → send (dry-run)
│   └── fixtures/
│       ├── posts.ts                     # Sample tweets
│       └── articles.ts                  # Sample KB articles
│
└── docs/
    ├── superpowers/specs/2026-04-28-x-monitor-design.md  # Already exists
    ├── superpowers/plans/2026-04-28-x-monitor-m1-mvp.md  # This file
    └── runbook.md                       # How to operate the system
```

---

## Cross-Cutting Conventions

Apply these throughout every task — they are not their own task.

- **TypeScript strict mode**: every package has `"strict": true` in tsconfig
- **Vitest**: every package has `"test": "vitest run"` in package.json
- **Logger**: every entry point creates a logger via `createLogger(processName)` from `@x-monitor/observability`
- **Heartbeat**: every long-running process calls `heartbeat(processName)` once per main loop iteration
- **Network gate**: every long-running process awaits `getNetworkStatus()` at the top of each loop iteration; if not HEALTHY, sleep and retry
- **trace_id**: every post carries a `trace_id` generated at scanner; logs include `trace_id` field
- **Idempotency**: every write that could cause a real-world side effect uses an idempotency_key
- **Commit cadence**: commit after each green test (granular per task), not at end of task
- **No Anthropic API**: tests must NOT call real Claude Code. `claude-client` is mocked in unit tests; only `tests/e2e/pipeline.test.ts` may invoke `claude -p` and that test is gated behind an env flag `RUN_LIVE_CLAUDE=1`

---

## Tasks

There are 22 tasks. Each task is one PR-sized unit. Tasks marked `[Foundation]` block all later tasks.

### Task 1: Repo scaffolding [Foundation]

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`
- Create: empty placeholder `README.md`

- [ ] **Step 1: Initialize pnpm workspace**

```bash
cd /Users/nightyoung/IdeaProjects/x-monitor
pnpm init
```

Replace `package.json` with:

```json
{
  "name": "x-monitor",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "pnpm -r --filter='./packages/*' --filter='./apps/*' build",
    "test": "pnpm -r --filter='./packages/*' --filter='./apps/*' test",
    "lint": "pnpm -r lint",
    "dev": "pm2 start ecosystem.config.cjs",
    "stop": "pm2 stop ecosystem.config.cjs"
  },
  "devDependencies": {
    "typescript": "5.4.5",
    "vitest": "1.6.0",
    "@types/node": "20.12.7"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules
dist
.next
*.log
.env
.env.local
.DS_Store
data/*.db
data/*.db-journal
.pm2
```

- [ ] **Step 5: Create .env.example**

```
# X Monitor Environment

# SQLite location
SQLITE_PATH=./data/x-monitor.db

# Redis
REDIS_URL=redis://localhost:6379

# Telegram alerts
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# X cookies
COOKIES_FINTAX_OFFICIAL=/Users/nightyoung/twitter_cookies_fintax_en.json

# AI behavior
CLAUDE_BIN=claude
RUN_LIVE_CLAUDE=0

# Dev / dry-run
POSTER_DRY_RUN=1
```

- [ ] **Step 6: Verify and commit**

```bash
pnpm install
ls -la
git add .
git commit -m "chore: initialize pnpm workspace"
```
Expected: `pnpm install` succeeds with no packages yet; commit lands.

---

### Task 2: `core` package — types, trace, time, result [Foundation]

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`, `types.ts`, `trace.ts`, `time.ts`, `result.ts`
- Test: `packages/core/tests/trace.test.ts`, `time.test.ts`

- [ ] **Step 1: Package boilerplate**

`packages/core/package.json`:
```json
{
  "name": "@x-monitor/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Write failing test for trace_id**

`packages/core/tests/trace.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { newTraceId } from '../src/trace.js'

describe('newTraceId', () => {
  it('produces unique 26-char ULID-like ids', () => {
    const a = newTraceId()
    const b = newTraceId()
    expect(a).toHaveLength(26)
    expect(b).toHaveLength(26)
    expect(a).not.toBe(b)
  })
  it('is sortable by time', () => {
    const a = newTraceId()
    const b = newTraceId()
    expect(a < b).toBe(true)
  })
})
```

- [ ] **Step 3: Run test (should fail — module missing)**

```bash
cd packages/core && pnpm test
```
Expected: FAIL — `Cannot find module '../src/trace.js'`

- [ ] **Step 4: Implement trace.ts**

`packages/core/src/trace.ts`:
```typescript
import { ulid } from 'ulid'
export const newTraceId = (): string => ulid()
```

Add ulid dep:
```bash
pnpm --filter @x-monitor/core add ulid
```

- [ ] **Step 5: Run test (should pass)**

```bash
pnpm test
```
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): add trace_id generator"
```

- [ ] **Step 7: Write failing test for time helpers**

`packages/core/tests/time.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { withinBusinessHours, addMinutes } from '../src/time.js'

describe('withinBusinessHours', () => {
  it('returns true at 10:00 when business is 9-23', () => {
    const d = new Date('2026-04-28T10:00:00+08:00')
    expect(withinBusinessHours(d, { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' })).toBe(true)
  })
  it('returns false at 03:00', () => {
    const d = new Date('2026-04-28T03:00:00+08:00')
    expect(withinBusinessHours(d, { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' })).toBe(false)
  })
})

describe('addMinutes', () => {
  it('adds minutes correctly', () => {
    const d = new Date('2026-04-28T10:00:00Z')
    expect(addMinutes(d, 30).toISOString()).toBe('2026-04-28T10:30:00.000Z')
  })
})
```

- [ ] **Step 8: Run test (should fail)**

```bash
pnpm test
```
Expected: FAIL — module missing.

- [ ] **Step 9: Implement time.ts**

`packages/core/src/time.ts`:
```typescript
export interface BusinessHours {
  startHour: number  // 0-23
  endHour: number    // 0-23 (exclusive end)
  tz: string         // IANA tz, e.g. 'Asia/Shanghai'
}

export function withinBusinessHours(d: Date, bh: BusinessHours): boolean {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: bh.tz,
    hour: '2-digit',
    hour12: false,
  })
  const hourStr = fmt.format(d)
  const hour = parseInt(hourStr === '24' ? '00' : hourStr, 10)
  return hour >= bh.startHour && hour < bh.endHour
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000)
}
```

- [ ] **Step 10: Run test (should pass)**

```bash
pnpm test
```
Expected: 4 passed.

- [ ] **Step 11: Implement types.ts and result.ts**

`packages/core/src/types.ts`:
```typescript
export type PostStatus =
  | 'discovered' | 'analyzing' | 'matched_article' | 'no_match'
  | 'drafting' | 'failed' | 'archived'

export type DraftStatus = 'pending' | 'approved' | 'rejected' | 'sent'

export interface Account {
  id: number
  handle: string
  role: 'official' | 'personal' | 'founder'
  cookiesPath: string
  dailyLimit: number
  minIntervalMin: number
  businessHours: { startHour: number; endHour: number; tz: string }
  cooldownUntil: number | null
}

export interface Post {
  id: number
  tweetId: string
  authorHandle: string
  text: string
  postedAt: number
  lang: string
  source: 'browser' | '3rdparty'
  scenarioHint: string | null
  status: PostStatus
  traceId: string
}

export interface Draft {
  id: number
  postId: number
  accountId: number
  content: string
  format: 'single' | 'thread' | 'quote'
  citations: { chunkId: string; quote: string }[]
  strategy: string | null
  status: DraftStatus
  idempotencyKey: string
}
```

`packages/core/src/result.ts`:
```typescript
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })
```

- [ ] **Step 12: Implement index.ts (barrel)**

```typescript
export * from './trace.js'
export * from './time.js'
export * from './types.js'
export * from './result.js'
```

- [ ] **Step 13: Build, test, commit**

```bash
pnpm build && pnpm test
git add packages/core
git commit -m "feat(core): add types, time helpers, Result"
```
Expected: build succeeds, 4 tests pass.

---

### Task 3: `db` package — schema + connection + repos [Foundation]

**Files:**
- Create: `packages/db/{package.json,tsconfig.json}`
- Create: `packages/db/src/{index.ts,connection.ts,schema.sql,migrate.ts,seed.ts}`
- Create: `packages/db/src/repos/{posts.ts,drafts.ts,scheduled.ts,sent.ts,accounts.ts,health.ts,audit.ts,deadLetter.ts}`
- Test: `packages/db/tests/{posts.test.ts,drafts.test.ts,migrate.test.ts}`

- [ ] **Step 1: Package boilerplate + deps**

```bash
cd packages/db
# package.json with same template as core, name "@x-monitor/db"
# add deps:
pnpm add better-sqlite3
pnpm add -D @types/better-sqlite3
# workspace dep:
pnpm add @x-monitor/core@workspace:*
```

- [ ] **Step 2: Write schema.sql**

`packages/db/src/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  cookies_path TEXT NOT NULL,
  daily_limit INTEGER NOT NULL DEFAULT 30,
  min_interval_min INTEGER NOT NULL DEFAULT 15,
  business_hours_json TEXT NOT NULL,
  cooldown_until INTEGER
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tweet_id TEXT NOT NULL UNIQUE,
  author_handle TEXT NOT NULL,
  text TEXT NOT NULL,
  posted_at INTEGER NOT NULL,
  lang TEXT NOT NULL,
  source TEXT NOT NULL,
  scenario_hint TEXT,
  status TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  archived_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_trace ON posts(trace_id);

CREATE TABLE IF NOT EXISTS post_analysis (
  post_id INTEGER PRIMARY KEY REFERENCES posts(id),
  type TEXT,
  viewpoint TEXT,
  scenario TEXT,
  kb_match_score REAL,
  kb_chunks_json TEXT,
  analyzed_at INTEGER NOT NULL,
  prompt_version TEXT
);

CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  content TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'single',
  citations_json TEXT NOT NULL DEFAULT '[]',
  strategy TEXT,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  prompt_version TEXT
);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);

CREATE TABLE IF NOT EXISTS scheduled (
  draft_id INTEGER PRIMARY KEY REFERENCES drafts(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  target_send_at INTEGER NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_scheduled_target ON scheduled(target_send_at);

CREATE TABLE IF NOT EXISTS sent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id INTEGER NOT NULL UNIQUE REFERENCES drafts(id),
  tweet_id TEXT NOT NULL UNIQUE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  sent_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  payload_json TEXT,
  trace_id TEXT,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dead_letter (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  last_error TEXT NOT NULL,
  retry_count INTEGER NOT NULL,
  moved_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS system_health (
  process_name TEXT PRIMARY KEY,
  last_heartbeat INTEGER NOT NULL,
  status TEXT NOT NULL,
  last_error TEXT
);
```

- [ ] **Step 3: Implement connection.ts and migrate.ts**

`packages/db/src/connection.ts`:
```typescript
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

let db: Database.Database | null = null

export function getDb(path: string = process.env.SQLITE_PATH ?? './data/x-monitor.db'): Database.Database {
  if (db) return db
  mkdirSync(dirname(path), { recursive: true })
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

export function closeDb(): void {
  if (db) { db.close(); db = null }
}
```

`packages/db/src/migrate.ts`:
```typescript
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type Database from 'better-sqlite3'

export function migrate(db: Database.Database): void {
  const here = dirname(fileURLToPath(import.meta.url))
  const sql = readFileSync(resolve(here, '../src/schema.sql'), 'utf8')
  db.exec(sql)
}
```

- [ ] **Step 4: Write failing test for migration**

`packages/db/tests/migrate.test.ts`:
```typescript
import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../src/migrate.js'

describe('migrate', () => {
  let db: Database.Database
  afterEach(() => { db?.close() })

  it('creates all expected tables', () => {
    db = new Database(':memory:')
    migrate(db)
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]
    const names = tables.map(t => t.name).sort()
    expect(names).toContain('posts')
    expect(names).toContain('drafts')
    expect(names).toContain('scheduled')
    expect(names).toContain('sent')
    expect(names).toContain('accounts')
    expect(names).toContain('audit_log')
    expect(names).toContain('dead_letter')
    expect(names).toContain('system_health')
    expect(names).toContain('post_analysis')
  })

  it('is idempotent', () => {
    db = new Database(':memory:')
    migrate(db)
    migrate(db)
    // No throw = pass
  })
})
```

- [ ] **Step 5: Run, verify pass**

```bash
pnpm test
```
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat(db): schema + migrate"
```

- [ ] **Step 7: Write failing tests for postsRepo**

`packages/db/tests/posts.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../src/migrate.js'
import { postsRepo } from '../src/repos/posts.js'

describe('postsRepo', () => {
  let db: Database.Database
  beforeEach(() => { db = new Database(':memory:'); migrate(db) })
  afterEach(() => { db.close() })

  it('insert + findById round-trips', () => {
    const id = postsRepo(db).insert({
      tweetId: '123', authorHandle: 'alice', text: 'hello',
      postedAt: 1000, lang: 'en', source: 'browser',
      scenarioHint: null, status: 'discovered', traceId: 'abc',
    })
    const p = postsRepo(db).findById(id)
    expect(p?.tweetId).toBe('123')
    expect(p?.text).toBe('hello')
    expect(p?.status).toBe('discovered')
  })

  it('insert is idempotent on tweetId', () => {
    const a = postsRepo(db).insert({
      tweetId: '123', authorHandle: 'alice', text: 'hello',
      postedAt: 1000, lang: 'en', source: 'browser',
      scenarioHint: null, status: 'discovered', traceId: 'abc',
    })
    const b = postsRepo(db).insert({
      tweetId: '123', authorHandle: 'alice', text: 'hello',
      postedAt: 1000, lang: 'en', source: 'browser',
      scenarioHint: null, status: 'discovered', traceId: 'def',
    })
    expect(a).toBe(b)  // same row id
  })

  it('updateStatus changes status', () => {
    const id = postsRepo(db).insert({
      tweetId: '123', authorHandle: 'alice', text: 'hello',
      postedAt: 1000, lang: 'en', source: 'browser',
      scenarioHint: null, status: 'discovered', traceId: 'abc',
    })
    postsRepo(db).updateStatus(id, 'analyzing')
    expect(postsRepo(db).findById(id)?.status).toBe('analyzing')
  })
})
```

- [ ] **Step 8: Implement postsRepo**

`packages/db/src/repos/posts.ts`:
```typescript
import type Database from 'better-sqlite3'
import type { Post, PostStatus } from '@x-monitor/core'

interface InsertPostInput {
  tweetId: string; authorHandle: string; text: string
  postedAt: number; lang: string; source: 'browser' | '3rdparty'
  scenarioHint: string | null; status: PostStatus; traceId: string
}

export function postsRepo(db: Database.Database) {
  return {
    insert(p: InsertPostInput): number {
      const existing = db.prepare(`SELECT id FROM posts WHERE tweet_id = ?`).get(p.tweetId) as { id: number } | undefined
      if (existing) return existing.id
      const stmt = db.prepare(`
        INSERT INTO posts (tweet_id, author_handle, text, posted_at, lang, source, scenario_hint, status, trace_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const info = stmt.run(p.tweetId, p.authorHandle, p.text, p.postedAt, p.lang, p.source, p.scenarioHint, p.status, p.traceId, Date.now())
      return Number(info.lastInsertRowid)
    },

    findById(id: number): Post | null {
      const r = db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id) as any
      if (!r) return null
      return {
        id: r.id, tweetId: r.tweet_id, authorHandle: r.author_handle,
        text: r.text, postedAt: r.posted_at, lang: r.lang, source: r.source,
        scenarioHint: r.scenario_hint, status: r.status, traceId: r.trace_id,
      }
    },

    updateStatus(id: number, status: PostStatus): void {
      db.prepare(`UPDATE posts SET status = ? WHERE id = ?`).run(status, id)
    },
  }
}
```

- [ ] **Step 9: Run, commit**

```bash
pnpm test  # 5 passed
git add packages/db
git commit -m "feat(db): postsRepo + tests"
```

- [ ] **Step 10: Implement remaining repos following same TDD pattern**

For each of `drafts`, `scheduled`, `sent`, `accounts`, `health`, `audit`, `deadLetter`:
1. Write failing test for the repo's primary methods (insert + read)
2. Implement repo
3. Run test
4. Commit

Reference methods needed for M1:
- `draftsRepo`: insert, findById, listByStatus, updateStatus, listPendingForUI
- `scheduledRepo`: upsert, findReadyToSend (target_send_at <= NOW), nextForAccount
- `sentRepo`: insert, findByTweetId, findByDraftId
- `accountsRepo`: findByHandle, findById, list
- `healthRepo`: heartbeat(name), all(), get(name)
- `auditRepo`: log({ actor, action, ... })
- `deadLetterRepo`: insert(taskType, payload, error, retryCount), list, deleteById

Don't write more than each requires for M1. YAGNI.

- [ ] **Step 11: Final commit for db package**

```bash
git add packages/db
git commit -m "feat(db): all repos for M1"
```

---

### Task 4: `queue` package — Redis wrappers [Foundation]

**Files:**
- Create: `packages/queue/{package.json,tsconfig.json}`, `src/{index.ts,connection.ts,queues.ts,netStatus.ts}`
- Test: `packages/queue/tests/queues.test.ts`

Tests run against a real local Redis. CI/dev requires `redis-server` running on `localhost:6379`. Tests use a unique key prefix per run to avoid bleed.

- [ ] **Step 1: Package boilerplate**

```bash
cd packages/queue
# package.json with name "@x-monitor/queue"
pnpm add ioredis bullmq
pnpm add @x-monitor/core@workspace:*
```

- [ ] **Step 2: Write failing test for queue add+consume**

`packages/queue/tests/queues.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Queue, Worker } from 'bullmq'
import { connection } from '../src/connection.js'

describe('ai-tasks queue', () => {
  let q: Queue
  let w: Worker | null = null
  const QNAME = `test-ai-tasks-${Date.now()}`
  beforeEach(() => { q = new Queue(QNAME, { connection }) })
  afterEach(async () => { await w?.close(); await q.obliterate({ force: true }); await q.close() })

  it('produces and consumes a job', async () => {
    await q.add('analyze', { postId: 42 })
    const got = await new Promise<{ postId: number }>((resolve) => {
      w = new Worker<{ postId: number }>(QNAME, async (job) => { resolve(job.data); return null }, { connection })
    })
    expect(got).toEqual({ postId: 42 })
  }, 10_000)
})
```

- [ ] **Step 3: Implement connection.ts**

`packages/queue/src/connection.ts`:
```typescript
import IORedis from 'ioredis'

export const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})
```

- [ ] **Step 4: Run test (requires `redis-server` running)**

```bash
pnpm test
```
Expected: PASS. If FAIL with ECONNREFUSED, start redis: `brew services start redis`.

- [ ] **Step 5: Implement queues.ts**

`packages/queue/src/queues.ts`:
```typescript
import { Queue } from 'bullmq'
import { connection } from './connection.js'

export interface AiTaskPayload { postId: number; traceId: string }
export interface SendTaskPayload { draftId: number; traceId: string }

export const aiTasksQ = new Queue<AiTaskPayload>('ai-tasks', { connection })
export const sendTasksQ = new Queue<SendTaskPayload>('send-tasks', { connection })
```

- [ ] **Step 6: Implement netStatus.ts**

`packages/queue/src/netStatus.ts`:
```typescript
import { connection } from './connection.js'

export type NetStatus = 'HEALTHY' | 'DEGRADED_X' | 'DEGRADED_DIFY' | 'DOWN'

const KEY = 'network-status'
const CHANNEL = 'network-status'

export async function publishNetStatus(s: NetStatus): Promise<void> {
  await connection.set(KEY, s)
  await connection.publish(CHANNEL, s)
}

export async function getNetStatus(): Promise<NetStatus> {
  const s = await connection.get(KEY)
  return (s as NetStatus | null) ?? 'HEALTHY'  // optimistic default
}

export function subscribeNetStatus(cb: (s: NetStatus) => void): () => Promise<void> {
  const sub = connection.duplicate()
  sub.subscribe(CHANNEL)
  sub.on('message', (_ch, msg) => cb(msg as NetStatus))
  return async () => { await sub.unsubscribe(CHANNEL); await sub.quit() }
}
```

- [ ] **Step 7: Build, commit**

```bash
pnpm build && pnpm test
git add packages/queue
git commit -m "feat(queue): Redis connection, BullMQ queues, netStatus pub/sub"
```

---

### Task 5: `observability` package — logger, heartbeat, telegram

**Files:**
- Create: `packages/observability/{package.json,tsconfig.json}`, `src/{index.ts,logger.ts,heartbeat.ts,telegram.ts}`
- Test: `tests/{logger.test.ts,heartbeat.test.ts}`

- [ ] **Step 1: Package boilerplate**

```bash
cd packages/observability
# package.json name "@x-monitor/observability"
pnpm add @x-monitor/core@workspace:* @x-monitor/db@workspace:*
```

- [ ] **Step 2: Failing test for logger**

`packages/observability/tests/logger.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { createLogger } from '../src/logger.js'

describe('createLogger', () => {
  it('emits JSON lines with process and trace_id', () => {
    const out: string[] = []
    const log = createLogger('test-proc', (line) => out.push(line))
    log.info('hello', { traceId: 'abc' })
    const parsed = JSON.parse(out[0])
    expect(parsed.process).toBe('test-proc')
    expect(parsed.level).toBe('info')
    expect(parsed.msg).toBe('hello')
    expect(parsed.traceId).toBe('abc')
    expect(typeof parsed.ts).toBe('number')
  })
})
```

- [ ] **Step 3: Implement logger.ts**

```typescript
type LogFn = (msg: string, ctx?: Record<string, unknown>) => void

export interface Logger {
  info: LogFn
  warn: LogFn
  error: LogFn
}

export function createLogger(proc: string, sink: (line: string) => void = console.log): Logger {
  const make = (level: 'info' | 'warn' | 'error'): LogFn =>
    (msg, ctx = {}) => sink(JSON.stringify({ ts: Date.now(), level, process: proc, msg, ...ctx }))
  return { info: make('info'), warn: make('warn'), error: make('error') }
}
```

- [ ] **Step 4: Run test, commit**

```bash
pnpm test
git add packages/observability
git commit -m "feat(observability): structured JSON logger"
```

- [ ] **Step 5: Failing test + impl for heartbeat**

`packages/observability/tests/heartbeat.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '@x-monitor/db'
import { healthRepo } from '@x-monitor/db'
import { heartbeat } from '../src/heartbeat.js'

describe('heartbeat', () => {
  let db: Database.Database
  beforeEach(() => { db = new Database(':memory:'); migrate(db) })
  afterEach(() => { db.close() })

  it('upserts a row in system_health', () => {
    heartbeat(db, 'scanner-browser', 'ok')
    const r = healthRepo(db).get('scanner-browser')
    expect(r?.status).toBe('ok')
    expect(r?.lastHeartbeat).toBeGreaterThan(Date.now() - 1000)
  })
})
```

`packages/observability/src/heartbeat.ts`:
```typescript
import type Database from 'better-sqlite3'
import { healthRepo } from '@x-monitor/db'

export function heartbeat(db: Database.Database, processName: string, status: 'ok' | 'error', lastError?: string): void {
  healthRepo(db).heartbeat(processName, status, lastError ?? null)
}
```

(`healthRepo.heartbeat` does `INSERT OR REPLACE` into `system_health`.)

- [ ] **Step 6: Implement telegram.ts**

`packages/observability/src/telegram.ts`:
```typescript
export async function sendTelegramAlert(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return  // skip in dev
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
  })
}
```

No unit test for telegram (network side-effect; will be exercised in E2E manually).

- [ ] **Step 7: index.ts, build, commit**

```typescript
export * from './logger.js'
export * from './heartbeat.js'
export * from './telegram.js'
```

```bash
pnpm build && pnpm test
git add packages/observability
git commit -m "feat(observability): heartbeat + telegram"
```

---

### Task 6: `kb-fixture` package — static KB for M1

**Files:**
- Create: `packages/kb-fixture/{package.json,tsconfig.json}`, `src/{index.ts,articles.ts,search.ts}`
- Test: `tests/search.test.ts`

This replaces Dify in M1 so the pipeline can run end-to-end without external dependencies.

- [ ] **Step 1: Package boilerplate**

```bash
# name "@x-monitor/kb-fixture"
pnpm add @x-monitor/core@workspace:*
```

- [ ] **Step 2: Define fixture articles**

`packages/kb-fixture/src/articles.ts`:
```typescript
export interface Article {
  id: string
  title: string
  url: string
  lang: string
  chunks: { id: string; text: string }[]
}

export const articles: Article[] = [
  {
    id: 'art-staking',
    title: 'How Crypto Staking Rewards Are Taxed',
    url: 'https://fintax.tech/staking-tax',
    lang: 'en',
    chunks: [
      { id: 'staking-1', text: 'Staking rewards are taxed at fair market value at the moment of receipt under IRS guidance.' },
      { id: 'staking-2', text: 'Subsequent disposal of staked tokens triggers a separate capital gains event.' },
    ],
  },
  {
    id: 'art-defi',
    title: 'DeFi Tax Reporting Guide',
    url: 'https://fintax.tech/defi-tax',
    lang: 'en',
    chunks: [
      { id: 'defi-1', text: 'DeFi liquidity provision has ambiguous tax treatment depending on jurisdiction.' },
      { id: 'defi-2', text: 'Most jurisdictions require reporting of yield farming income at fair market value.' },
    ],
  },
]
```

- [ ] **Step 3: Failing test for search**

`packages/kb-fixture/tests/search.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { searchKB } from '../src/search.js'

describe('searchKB', () => {
  it('returns articles ranked by keyword overlap', () => {
    const results = searchKB('I have a question about staking taxes')
    expect(results[0].article.id).toBe('art-staking')
    expect(results[0].score).toBeGreaterThan(0)
  })
  it('returns empty when nothing matches', () => {
    const results = searchKB('completely unrelated topic about pet food')
    expect(results).toEqual([])
  })
})
```

- [ ] **Step 4: Implement search.ts (simple keyword overlap)**

```typescript
import { articles, type Article } from './articles.js'

export interface SearchResult {
  article: Article
  chunks: { id: string; text: string; score: number }[]
  score: number
}

const STOP = new Set(['the','a','an','i','have','is','are','of','to','in','on','for','about','my'])

function tokens(s: string): string[] {
  return s.toLowerCase().match(/[a-z]+/g)?.filter(t => !STOP.has(t)) ?? []
}

export function searchKB(query: string): SearchResult[] {
  const qToks = new Set(tokens(query))
  if (qToks.size === 0) return []
  const out: SearchResult[] = []
  for (const a of articles) {
    const chunkScores = a.chunks.map(c => {
      const cToks = tokens(c.text)
      const overlap = cToks.filter(t => qToks.has(t)).length
      return { id: c.id, text: c.text, score: overlap / Math.max(cToks.length, 1) }
    })
    const top = chunkScores.filter(c => c.score > 0)
    if (top.length === 0) continue
    out.push({ article: a, chunks: top, score: Math.max(...top.map(c => c.score)) })
  }
  return out.sort((a, b) => b.score - a.score)
}
```

- [ ] **Step 5: Run, commit**

```bash
pnpm test
git add packages/kb-fixture
git commit -m "feat(kb-fixture): static KB with simple keyword search"
```

---

### Task 7: `claude-client` package — `claude -p` subprocess wrapper

**Files:**
- Create: `packages/claude-client/{package.json,tsconfig.json}`, `src/{index.ts,runPrompt.ts}`
- Test: `tests/runPrompt.test.ts`

- [ ] **Step 1: Package boilerplate**

```bash
# name "@x-monitor/claude-client"
pnpm add @x-monitor/core@workspace:*
```

- [ ] **Step 2: Implement runPrompt.ts**

`packages/claude-client/src/runPrompt.ts`:
```typescript
import { spawn } from 'node:child_process'

export interface RunPromptOptions {
  prompt: string
  timeoutMs?: number
  // For tests: override the subprocess invoker
  spawner?: typeof spawn
}

export interface RunPromptResult {
  text: string
  durationMs: number
}

export async function runPrompt(opts: RunPromptOptions): Promise<RunPromptResult> {
  const bin = process.env.CLAUDE_BIN ?? 'claude'
  const start = Date.now()
  const child = (opts.spawner ?? spawn)(bin, ['-p', opts.prompt], { stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  let err = ''
  child.stdout!.on('data', (d) => { out += d.toString() })
  child.stderr!.on('data', (d) => { err += d.toString() })
  const timeout = opts.timeoutMs ?? 120_000
  const exit = await Promise.race([
    new Promise<number>((resolve) => child.on('exit', (c) => resolve(c ?? 0))),
    new Promise<number>((_, reject) => setTimeout(() => { child.kill('SIGKILL'); reject(new Error('claude timeout')) }, timeout)),
  ])
  if (exit !== 0) throw new Error(`claude exited ${exit}: ${err}`)
  return { text: out.trim(), durationMs: Date.now() - start }
}
```

- [ ] **Step 3: Failing test using mock spawner**

`packages/claude-client/tests/runPrompt.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { EventEmitter, Readable } from 'node:stream'
import { runPrompt } from '../src/runPrompt.js'

function fakeSpawn(stdout: string, exitCode = 0) {
  return () => {
    const ee: any = new EventEmitter()
    ee.stdout = Readable.from([stdout])
    ee.stderr = Readable.from([''])
    ee.kill = () => {}
    setImmediate(() => ee.emit('exit', exitCode))
    return ee
  }
}

describe('runPrompt', () => {
  it('returns stdout when exit 0', async () => {
    const r = await runPrompt({ prompt: 'hi', spawner: fakeSpawn('hello world') as any })
    expect(r.text).toBe('hello world')
  })
  it('throws on non-zero exit', async () => {
    await expect(runPrompt({ prompt: 'hi', spawner: fakeSpawn('', 1) as any })).rejects.toThrow(/exited 1/)
  })
})
```

- [ ] **Step 4: Run, commit**

```bash
pnpm test
git add packages/claude-client
git commit -m "feat(claude-client): subprocess wrapper for claude -p"
```

---

### Task 8: `prompts` package — analyzePost + draftFromArticle

**Files:**
- Create: `packages/prompts/{package.json,tsconfig.json}`, `src/{index.ts,analyzePost.ts,draftFromArticle.ts}`
- Test: `tests/{analyzePost.test.ts,draftFromArticle.test.ts}`

Each prompt is a function that returns a fully-formed string. The function takes a typed input. The TEST verifies the prompt CONTAINS specific instructions and required placeholders are filled.

- [ ] **Step 1: Package boilerplate, deps**

```bash
# name "@x-monitor/prompts"
pnpm add @x-monitor/core@workspace:* @x-monitor/kb-fixture@workspace:*
```

- [ ] **Step 2: Failing test for analyzePost**

```typescript
import { describe, it, expect } from 'vitest'
import { buildAnalyzePostPrompt, parseAnalyzePostResponse } from '../src/analyzePost.js'

describe('buildAnalyzePostPrompt', () => {
  it('includes the post text and asks for JSON output', () => {
    const p = buildAnalyzePostPrompt({ text: 'How are staking rewards taxed?', authorHandle: 'alice' })
    expect(p).toContain('How are staking rewards taxed?')
    expect(p).toContain('@alice')
    expect(p).toMatch(/JSON/)
  })
})

describe('parseAnalyzePostResponse', () => {
  it('extracts JSON from a fenced code block', () => {
    const raw = 'Here you go:\n```json\n{"type":"question","scenario":"1","viewpoint":"asks how staking is taxed"}\n```\nDone.'
    const r = parseAnalyzePostResponse(raw)
    expect(r.type).toBe('question')
    expect(r.scenario).toBe('1')
  })
  it('handles bare JSON', () => {
    const raw = '{"type":"opinion","scenario":"2","viewpoint":"x"}'
    const r = parseAnalyzePostResponse(raw)
    expect(r.type).toBe('opinion')
  })
  it('throws on garbage', () => {
    expect(() => parseAnalyzePostResponse('lol no')).toThrow()
  })
})
```

- [ ] **Step 3: Implement analyzePost.ts**

```typescript
export interface AnalyzePostInput { text: string; authorHandle: string }
export interface AnalyzePostResult {
  type: 'question' | 'opinion' | 'discussion' | 'news' | 'personal' | 'other'
  scenario: '1' | '2' | '3' | 'skip'
  viewpoint: string
}

export const PROMPT_VERSION = 'analyze-post@v1'

export function buildAnalyzePostPrompt(p: AnalyzePostInput): string {
  return `You are an analyst classifying X (Twitter) posts about cryptocurrency tax.

Post by @${p.authorHandle}:
"""
${p.text}
"""

Tasks:
1. Classify "type": question | opinion | discussion | news | personal | other
2. Identify the core viewpoint in one sentence (English).
3. Decide which scenario applies: "1" if the post raises a concrete tax topic likely to match a tax article; "2" if it's a discussion/opinion needing a synthesized response; "skip" if not actionable.

Output ONLY a JSON object on a single line, no prose:
{"type":"...","scenario":"...","viewpoint":"..."}
`
}

export function parseAnalyzePostResponse(raw: string): AnalyzePostResult {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : raw
  const jsonMatch = candidate.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON in response: ${raw.slice(0, 200)}`)
  return JSON.parse(jsonMatch[0]) as AnalyzePostResult
}
```

- [ ] **Step 4: Run tests, commit**

```bash
pnpm test
git add packages/prompts
git commit -m "feat(prompts): analyzePost prompt + parser"
```

- [ ] **Step 5: Failing test + impl for draftFromArticle**

Test:
```typescript
import { describe, it, expect } from 'vitest'
import { buildDraftFromArticlePrompt, parseDraftFromArticleResponse } from '../src/draftFromArticle.js'

describe('buildDraftFromArticlePrompt', () => {
  it('includes post, article chunks with chunk_ids, and length constraint', () => {
    const p = buildDraftFromArticlePrompt({
      post: { text: 'How are staking rewards taxed?', authorHandle: 'alice' },
      article: { id: 'art-staking', title: 'Staking Tax', url: 'https://fintax.tech/staking-tax' },
      chunks: [{ id: 'staking-1', text: 'Staking rewards are taxed at FMV...' }],
    })
    expect(p).toContain('staking-1')
    expect(p).toContain('https://fintax.tech/staking-tax')
    expect(p).toMatch(/280/)
  })
})

describe('parseDraftFromArticleResponse', () => {
  it('extracts content + citations[]', () => {
    const raw = '```json\n{"content":"Great question. ...","citations":[{"chunkId":"staking-1","quote":"taxed at FMV"}]}\n```'
    const r = parseDraftFromArticleResponse(raw)
    expect(r.content).toContain('Great question')
    expect(r.citations[0].chunkId).toBe('staking-1')
  })
})
```

Impl:
```typescript
export interface DraftFromArticleInput {
  post: { text: string; authorHandle: string }
  article: { id: string; title: string; url: string }
  chunks: { id: string; text: string }[]
}
export interface DraftFromArticleResult {
  content: string
  citations: { chunkId: string; quote: string }[]
}
export const PROMPT_VERSION = 'draft-from-article@v1'

export function buildDraftFromArticlePrompt(p: DraftFromArticleInput): string {
  const chunkBlock = p.chunks.map(c => `[${c.id}] ${c.text}`).join('\n')
  return `You are a content operator at FinTax (crypto tax SaaS).

Original post by @${p.post.authorHandle}:
"""
${p.post.text}
"""

Reference article: "${p.article.title}" — ${p.article.url}
Available passages from this article (each tagged with chunk_id):
${chunkBlock}

Write a single English X reply that:
- Naturally engages with the original post
- Draws ONLY from the passages above (no invented facts)
- Includes the article URL inline
- Stays under 280 characters total
- Does not sound promotional

Output ONLY a JSON object:
{"content":"<the reply text>","citations":[{"chunkId":"<id>","quote":"<words from that chunk you used>"}, ...]}
`
}

export function parseDraftFromArticleResponse(raw: string): DraftFromArticleResult {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : raw
  const jsonMatch = candidate.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON in response: ${raw.slice(0, 200)}`)
  return JSON.parse(jsonMatch[0]) as DraftFromArticleResult
}
```

- [ ] **Step 6: Test, commit**

```bash
pnpm test
git add packages/prompts
git commit -m "feat(prompts): draftFromArticle prompt + parser"
```

---

### Task 9: `rules` package — scheduling + matchingThreshold

**Files:**
- Create: `packages/rules/{package.json,tsconfig.json}`, `src/{index.ts,scheduling.ts,matchingThreshold.ts}`
- Test: `tests/{scheduling.test.ts,matchingThreshold.test.ts}`

- [ ] **Step 1: Boilerplate**

```bash
# name "@x-monitor/rules"
pnpm add @x-monitor/core@workspace:*
```

- [ ] **Step 2: Failing test for computeTargetSendAt**

```typescript
import { describe, it, expect } from 'vitest'
import { computeTargetSendAt } from '../src/scheduling.js'

const ACCOUNT_BH = { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' }

describe('computeTargetSendAt', () => {
  it('schedules NOW + min_interval when account idle and within hours', () => {
    const now = new Date('2026-04-28T10:00:00+08:00').getTime()
    const r = computeTargetSendAt({
      now, lastSentAt: null, minIntervalMin: 15, dailyLimit: 30, todayCount: 0,
      businessHours: ACCOUNT_BH,
    })
    expect(r.target - now).toBeCloseTo(15 * 60_000, -2)
  })

  it('respects last_sent_at if more recent than now-interval', () => {
    const now = new Date('2026-04-28T10:00:00+08:00').getTime()
    const lastSent = now - 5 * 60_000  // 5min ago
    const r = computeTargetSendAt({
      now, lastSentAt: lastSent, minIntervalMin: 15, dailyLimit: 30, todayCount: 0,
      businessHours: ACCOUNT_BH,
    })
    // Next send = lastSent + 15min = now + 10min
    expect(r.target - now).toBeCloseTo(10 * 60_000, -2)
  })

  it('pushes to next business window when outside hours', () => {
    const now = new Date('2026-04-28T03:00:00+08:00').getTime()  // 3 AM Shanghai
    const r = computeTargetSendAt({
      now, lastSentAt: null, minIntervalMin: 15, dailyLimit: 30, todayCount: 0,
      businessHours: ACCOUNT_BH,
    })
    const targetDate = new Date(r.target)
    expect(targetDate.toISOString()).toMatch(/T01:00:00/)  // 09:00 Shanghai = 01:00 UTC
  })

  it('pushes to tomorrow when daily_limit reached', () => {
    const now = new Date('2026-04-28T10:00:00+08:00').getTime()
    const r = computeTargetSendAt({
      now, lastSentAt: null, minIntervalMin: 15, dailyLimit: 30, todayCount: 30,
      businessHours: ACCOUNT_BH,
    })
    expect(r.target).toBeGreaterThan(new Date('2026-04-29T01:00:00Z').getTime())
  })
})
```

- [ ] **Step 3: Implement scheduling.ts**

```typescript
import type { BusinessHours } from '@x-monitor/core'
import { withinBusinessHours, addMinutes } from '@x-monitor/core'

export interface ComputeInput {
  now: number
  lastSentAt: number | null
  minIntervalMin: number
  dailyLimit: number
  todayCount: number
  businessHours: BusinessHours
}
export interface ComputeResult { target: number }

function nextBusinessStart(d: Date, bh: BusinessHours): Date {
  // Naive: try same day at startHour; if past, tomorrow
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: bh.tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  const parts = fmt.formatToParts(d)
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const day = parts.find(p => p.type === 'day')!.value
  // Construct startHour in tz: build ISO string and let Intl parse… simpler: use offset.
  // For Asia/Shanghai (+08:00), startHour 9 = ${y}-${m}-${day}T09:00:00+08:00
  const offsetH = bh.tz === 'Asia/Shanghai' ? 8 : 0  // M1 only Shanghai; generalize later
  const sign = offsetH >= 0 ? '+' : '-'
  const off = `${sign}${String(Math.abs(offsetH)).padStart(2, '0')}:00`
  let candidate = new Date(`${y}-${m}-${day}T${String(bh.startHour).padStart(2,'0')}:00:00${off}`)
  if (candidate.getTime() <= d.getTime()) {
    candidate = new Date(candidate.getTime() + 24 * 3600_000)
  }
  return candidate
}

export function computeTargetSendAt(i: ComputeInput): ComputeResult {
  let base = i.now + i.minIntervalMin * 60_000
  if (i.lastSentAt !== null) {
    base = Math.max(base, i.lastSentAt + i.minIntervalMin * 60_000)
  }
  if (i.todayCount >= i.dailyLimit) {
    return { target: nextBusinessStart(new Date(i.now + 24 * 3600_000), i.businessHours).getTime() }
  }
  const baseDate = new Date(base)
  if (!withinBusinessHours(baseDate, i.businessHours)) {
    return { target: nextBusinessStart(baseDate, i.businessHours).getTime() }
  }
  return { target: base }
}
```

- [ ] **Step 4: Implement matchingThreshold.ts**

```typescript
export const KB_MATCH_THRESHOLD = 0.15  // overlap-ratio threshold for keyword KB
export function isMatched(score: number): boolean { return score >= KB_MATCH_THRESHOLD }
```

(test minimal: import + boundary check)

- [ ] **Step 5: Test, commit**

```bash
pnpm test
git add packages/rules
git commit -m "feat(rules): scheduling algorithm + match threshold"
```

---

### Task 10: `x-client` package — XClient with dry-run fake [Foundation]

**Files:**
- Create: `packages/x-client/{package.json,tsconfig.json}`, `src/{index.ts,client.ts,cookies.ts,dryRun.ts}`
- Test: `tests/{dryRun.test.ts,client.test.ts}`

The XClient interface deliberately abstracts xactions so tests use a fake. The real implementation calls xactions in production.

- [ ] **Step 1: Boilerplate, deps**

```bash
# name "@x-monitor/x-client"
pnpm add @x-monitor/core@workspace:*
# xactions installed locally already, will be referenced by relative path or via npm link in production
```

- [ ] **Step 2: Define XClient interface in client.ts**

```typescript
export interface XSearchResult {
  tweetId: string
  authorHandle: string
  text: string
  postedAt: number
  lang: string
}

export interface XClient {
  search(query: string, sinceMs: number): Promise<XSearchResult[]>
  postReply(replyToTweetId: string, content: string, accountHandle: string): Promise<{ tweetId: string }>
  getTweet(tweetId: string): Promise<XSearchResult | null>
}
```

- [ ] **Step 3: Failing test for dry-run client**

```typescript
import { describe, it, expect } from 'vitest'
import { createDryRunClient } from '../src/dryRun.js'

describe('DryRunXClient', () => {
  it('records postReply without throwing', async () => {
    const c = createDryRunClient()
    const r = await c.postReply('orig-1', 'hi', 'FinTax_Official')
    expect(r.tweetId).toMatch(/^dry-/)
    expect(c.posted).toHaveLength(1)
    expect(c.posted[0].content).toBe('hi')
  })
  it('returns seeded search results', async () => {
    const c = createDryRunClient([{
      tweetId: '1', authorHandle: 'alice', text: 'about staking',
      postedAt: 1000, lang: 'en',
    }])
    const r = await c.search('staking', 0)
    expect(r).toHaveLength(1)
  })
})
```

- [ ] **Step 4: Implement dryRun.ts**

```typescript
import type { XClient, XSearchResult } from './client.js'

export interface DryRunXClient extends XClient {
  posted: { replyToTweetId: string; content: string; account: string; tweetId: string }[]
  seedSearch: (results: XSearchResult[]) => void
}

export function createDryRunClient(seeded: XSearchResult[] = []): DryRunXClient {
  const posted: DryRunXClient['posted'] = []
  let searchSeed = [...seeded]
  let counter = 0
  const client: DryRunXClient = {
    posted,
    seedSearch(r) { searchSeed = [...r] },
    async search(_q, _since) { return searchSeed },
    async postReply(replyToTweetId, content, account) {
      const tweetId = `dry-${++counter}`
      posted.push({ replyToTweetId, content, account, tweetId })
      return { tweetId }
    },
    async getTweet(tweetId) {
      return searchSeed.find(r => r.tweetId === tweetId) ?? null
    },
  }
  return client
}
```

- [ ] **Step 5: Implement real xactions client (deferred to live integration)**

For M1, the xactions client can be a thin shell that calls the existing xactions library. Implement minimum needed for `search` and `postReply`. If xactions is installed at `/Users/nightyoung/xactions`, use it via local file install:

```bash
cd packages/x-client
pnpm add file:/Users/nightyoung/xactions
```

`packages/x-client/src/client.ts` (production impl):
```typescript
// import { Twitter } from 'xactions/scrapers/twitter'
// import { postReplyViaCDP } from 'xactions/...' (whichever module)
//
// implementation deferred — actual xactions API to be wired up in Task 13
// when scanner-browser starts using it. For M1, only search() and postReply()
// need a real impl.
```

For now in M1: `client.ts` exports the interface only. Production XClient is implemented in Task 13 (scanner-browser) and Task 17 (poster) using the dryRun fake when `POSTER_DRY_RUN=1`.

- [ ] **Step 6: Implement cookies.ts**

```typescript
import { readFileSync } from 'node:fs'

export interface CookieEntry { name: string; value: string; domain?: string; path?: string }

export function loadCookies(path: string): CookieEntry[] {
  const raw = readFileSync(path, 'utf8')
  return JSON.parse(raw) as CookieEntry[]
}
```

- [ ] **Step 7: Test, commit**

```bash
pnpm test
git add packages/x-client
git commit -m "feat(x-client): XClient interface + DryRunXClient"
```

---

### Task 11: DB seed script — initial account + keyword

**Files:**
- Create: `scripts/seed.ts`, `packages/db/src/seed.ts`

- [ ] **Step 1: Implement seed**

`scripts/seed.ts`:
```typescript
import { getDb, migrate, accountsRepo } from '@x-monitor/db'

const db = getDb()
migrate(db)

const existing = accountsRepo(db).findByHandle('FinTax_Official')
if (!existing) {
  accountsRepo(db).insert({
    handle: 'FinTax_Official',
    role: 'official',
    cookiesPath: process.env.COOKIES_FINTAX_OFFICIAL ?? '/Users/nightyoung/twitter_cookies_fintax_en.json',
    dailyLimit: 30,
    minIntervalMin: 15,
    businessHours: { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' },
    cooldownUntil: null,
  })
  console.log('Seeded FinTax_Official')
} else {
  console.log('Account already exists')
}
```

Add to root `package.json`:
```json
"scripts": {
  "seed": "tsx scripts/seed.ts"
}
```

```bash
pnpm add -D tsx
```

- [ ] **Step 2: Run seed against fresh DB, commit**

```bash
rm -f data/x-monitor.db
pnpm build
pnpm seed
git add scripts/seed.ts packages/db
git commit -m "feat: db seed script"
```

---

### Task 12: `network-health` app

**Files:**
- Create: `apps/network-health/{package.json,tsconfig.json}`, `src/{index.ts,probe.ts,classify.ts}`
- Test: `tests/{probe.test.ts,classify.test.ts}`

- [ ] **Step 1: Boilerplate**

```bash
# name "@x-monitor/app-network-health"
pnpm add @x-monitor/core@workspace:* @x-monitor/db@workspace:* \
         @x-monitor/queue@workspace:* @x-monitor/observability@workspace:*
```

- [ ] **Step 2: Failing test for classify**

```typescript
import { describe, it, expect } from 'vitest'
import { classify } from '../src/classify.js'

describe('classify', () => {
  it('all reachable → HEALTHY', () => {
    expect(classify({ x: true, dify: true, internet: true })).toBe('HEALTHY')
  })
  it('internet ok, x down → DEGRADED_X', () => {
    expect(classify({ x: false, dify: true, internet: true })).toBe('DEGRADED_X')
  })
  it('all down → DOWN', () => {
    expect(classify({ x: false, dify: false, internet: false })).toBe('DOWN')
  })
})
```

- [ ] **Step 3: Implement classify.ts**

```typescript
import type { NetStatus } from '@x-monitor/queue'

export interface ProbeResults { x: boolean; dify: boolean; internet: boolean }

export function classify(r: ProbeResults): NetStatus {
  if (!r.internet) return 'DOWN'
  if (!r.x) return 'DEGRADED_X'
  if (!r.dify) return 'DEGRADED_DIFY'
  return 'HEALTHY'
}
```

- [ ] **Step 4: Implement probe.ts and entry**

`probe.ts`:
```typescript
export async function probeOne(url: string, timeoutMs = 5000): Promise<boolean> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { method: 'HEAD', signal: ctrl.signal })
    return r.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

export async function probeAll() {
  const [x, dify, internet] = await Promise.all([
    probeOne('https://x.com/'),
    probeOne('https://api.dify.ai/'),
    probeOne('https://1.1.1.1/'),
  ])
  return { x, dify, internet }
}
```

`index.ts`:
```typescript
import { probeAll } from './probe.js'
import { classify } from './classify.js'
import { publishNetStatus } from '@x-monitor/queue'
import { createLogger, heartbeat } from '@x-monitor/observability'
import { getDb, migrate } from '@x-monitor/db'

const log = createLogger('network-health')
const db = getDb(); migrate(db)

async function tick() {
  try {
    const r = await probeAll()
    const status = classify(r)
    await publishNetStatus(status)
    log.info('probed', { results: r, status })
    heartbeat(db, 'network-health', 'ok')
  } catch (e) {
    log.error('probe failed', { error: String(e) })
    heartbeat(db, 'network-health', 'error', String(e))
  }
}

await tick()
setInterval(tick, 5 * 60_000)
```

- [ ] **Step 5: Test, run manually, commit**

```bash
pnpm test  # classify tests
# manual: pnpm --filter @x-monitor/app-network-health build && node apps/network-health/dist/index.js
# verify it emits "probed" log lines and writes redis network-status
git add apps/network-health
git commit -m "feat(network-health): probe + publish status"
```

---

### Task 13: `scanner-browser` app (dry-run; live xactions wired in Task 18)

**Files:**
- Create: `apps/scanner-browser/{package.json,tsconfig.json}`, `src/{index.ts,scan.ts,loop.ts}`
- Test: `tests/{scan.test.ts,loop.test.ts}`

For M1, scanner-browser uses the **dry-run XClient** by default, controlled by env var `X_CLIENT_MODE=dry|live`. Live mode is wired up in Task 18.

- [ ] **Step 1: Boilerplate**

```bash
# name "@x-monitor/app-scanner-browser"
pnpm add @x-monitor/core@workspace:* @x-monitor/db@workspace:* \
         @x-monitor/queue@workspace:* @x-monitor/observability@workspace:* \
         @x-monitor/x-client@workspace:*
```

- [ ] **Step 2: Failing test for scan**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate, postsRepo } from '@x-monitor/db'
import { createDryRunClient } from '@x-monitor/x-client'
import { runOneScan } from '../src/scan.js'

describe('runOneScan', () => {
  let db: Database.Database
  beforeEach(() => { db = new Database(':memory:'); migrate(db) })
  afterEach(() => { db.close() })

  it('writes new posts and skips duplicates', async () => {
    const xc = createDryRunClient([
      { tweetId: 't1', authorHandle: 'a', text: 'staking', postedAt: 1000, lang: 'en' },
    ])
    await runOneScan({ db, xc, query: 'staking', enqueue: () => {} })
    const ids = db.prepare(`SELECT id FROM posts`).all()
    expect(ids).toHaveLength(1)
    // second run with same seed should NOT add a new row
    await runOneScan({ db, xc, query: 'staking', enqueue: () => {} })
    expect(db.prepare(`SELECT id FROM posts`).all()).toHaveLength(1)
  })

  it('enqueues post id for new posts', async () => {
    const xc = createDryRunClient([
      { tweetId: 't2', authorHandle: 'b', text: 'staking 2', postedAt: 1000, lang: 'en' },
    ])
    const enqueued: number[] = []
    await runOneScan({ db, xc, query: 'staking', enqueue: (id) => enqueued.push(id) })
    expect(enqueued).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Implement scan.ts**

```typescript
import type Database from 'better-sqlite3'
import type { XClient } from '@x-monitor/x-client'
import { postsRepo } from '@x-monitor/db'
import { newTraceId } from '@x-monitor/core'

export interface ScanInput {
  db: Database.Database
  xc: XClient
  query: string
  enqueue: (postId: number) => void
}

export async function runOneScan(i: ScanInput): Promise<{ found: number; new: number }> {
  const since = Date.now() - 6 * 30 * 24 * 3600_000  // 6 months for scenario 1
  const results = await i.xc.search(i.query, since)
  let added = 0
  for (const r of results) {
    const before = i.db.prepare(`SELECT id FROM posts WHERE tweet_id = ?`).get(r.tweetId) as { id: number } | undefined
    if (before) continue
    const id = postsRepo(i.db).insert({
      tweetId: r.tweetId, authorHandle: r.authorHandle, text: r.text,
      postedAt: r.postedAt, lang: r.lang, source: 'browser',
      scenarioHint: 'keyword:' + i.query, status: 'discovered', traceId: newTraceId(),
    })
    i.enqueue(id)
    added++
  }
  return { found: results.length, new: added }
}
```

- [ ] **Step 4: Implement loop.ts and entry**

`loop.ts`:
```typescript
import type Database from 'better-sqlite3'
import type { XClient } from '@x-monitor/x-client'
import type { Logger } from '@x-monitor/observability'
import { runOneScan } from './scan.js'
import { aiTasksQ, getNetStatus } from '@x-monitor/queue'
import { heartbeat } from '@x-monitor/observability'

export async function runLoop({
  db, xc, log, queries, intervalMs, traceIdGen,
}: {
  db: Database.Database
  xc: XClient
  log: Logger
  queries: string[]
  intervalMs: number
  traceIdGen?: () => string
}): Promise<void> {
  while (true) {
    const status = await getNetStatus()
    if (status === 'DOWN' || status === 'DEGRADED_X') {
      log.warn('skipping scan, network not healthy', { status })
      await sleep(intervalMs)
      continue
    }
    for (const q of queries) {
      try {
        const r = await runOneScan({
          db, xc, query: q,
          enqueue: (id) => { aiTasksQ.add('analyze', { postId: id, traceId: traceIdGen?.() ?? String(id) }) },
        })
        log.info('scanned', { query: q, ...r })
      } catch (e) {
        log.error('scan failed', { query: q, error: String(e) })
      }
    }
    heartbeat(db, 'scanner-browser', 'ok')
    await sleep(intervalMs)
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
```

`index.ts`:
```typescript
import { getDb, migrate } from '@x-monitor/db'
import { createDryRunClient } from '@x-monitor/x-client'
import { createLogger } from '@x-monitor/observability'
import { runLoop } from './loop.js'

const db = getDb(); migrate(db)
const log = createLogger('scanner-browser')

// M1: hardcoded query list. Edit this file when keywords change (per spec section 3.1, "config as code").
const queries = ['crypto tax', 'staking tax', 'IRS crypto', 'DeFi tax']

const xc = process.env.X_CLIENT_MODE === 'live'
  ? (() => { throw new Error('live X client not implemented in M1') })()
  : createDryRunClient()  // empty seed; dev injects via web-ui

const intervalMs = parseInt(process.env.SCANNER_INTERVAL_MS ?? '60000', 10)
log.info('starting', { queries, intervalMs })
await runLoop({ db, xc, log, queries, intervalMs })
```

- [ ] **Step 5: Test, commit**

```bash
pnpm test
git add apps/scanner-browser
git commit -m "feat(scanner-browser): dry-run scan loop"
```

---

### Task 14: `ai-worker` app — batch processor

**Files:**
- Create: `apps/ai-worker/{package.json,tsconfig.json}`, `src/{index.ts,batch.ts,analyze.ts,draft.ts}`
- Test: `tests/{batch.test.ts,analyze.test.ts,draft.test.ts}`

ai-worker is invoked **two ways** in M1:
1. As a long-running PM2 process polling the queue every minute (for dev convenience)
2. As a Claude Code routine entry point (production) — see Task 22

Both paths import the same `processBatch()` function.

- [ ] **Step 1: Boilerplate**

```bash
# name "@x-monitor/app-ai-worker"
pnpm add @x-monitor/core@workspace:* @x-monitor/db@workspace:* \
         @x-monitor/queue@workspace:* @x-monitor/observability@workspace:* \
         @x-monitor/prompts@workspace:* @x-monitor/kb-fixture@workspace:* \
         @x-monitor/claude-client@workspace:* @x-monitor/rules@workspace:*
```

- [ ] **Step 2: Failing test for analyzeOne (mocked claude-client)**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { analyzeOne } from '../src/analyze.js'

describe('analyzeOne', () => {
  it('returns parsed analysis from claude response', async () => {
    const fakeRun = vi.fn(async () => ({ text: '{"type":"question","scenario":"1","viewpoint":"asks about staking"}', durationMs: 100 }))
    const r = await analyzeOne(
      { text: 'staking question?', authorHandle: 'a' },
      { runPrompt: fakeRun }
    )
    expect(r.type).toBe('question')
    expect(r.scenario).toBe('1')
  })
})
```

- [ ] **Step 3: Implement analyze.ts**

```typescript
import { buildAnalyzePostPrompt, parseAnalyzePostResponse, PROMPT_VERSION as ANALYZE_VERSION } from '@x-monitor/prompts'
import type { runPrompt as RunPrompt } from '@x-monitor/claude-client'

export interface AnalyzeDeps { runPrompt: typeof RunPrompt }

export async function analyzeOne(
  post: { text: string; authorHandle: string },
  deps: AnalyzeDeps,
): Promise<ReturnType<typeof parseAnalyzePostResponse> & { promptVersion: string }> {
  const prompt = buildAnalyzePostPrompt(post)
  const r = await deps.runPrompt({ prompt, timeoutMs: 60_000 })
  return { ...parseAnalyzePostResponse(r.text), promptVersion: ANALYZE_VERSION }
}
```

- [ ] **Step 4: Failing test for draftOne**

Similar pattern: mocked `runPrompt`, calls `searchKB` from kb-fixture, verifies citations are passed through.

- [ ] **Step 5: Implement draft.ts**

```typescript
import { searchKB } from '@x-monitor/kb-fixture'
import { buildDraftFromArticlePrompt, parseDraftFromArticleResponse, PROMPT_VERSION as DRAFT_VERSION } from '@x-monitor/prompts'
import { isMatched } from '@x-monitor/rules'
import type { runPrompt as RunPrompt } from '@x-monitor/claude-client'

export interface DraftDeps { runPrompt: typeof RunPrompt }
export interface DraftResult {
  draft: { content: string; citations: { chunkId: string; quote: string }[] } | null
  reason: 'matched' | 'no_match'
  matchScore: number
  articleId?: string
  promptVersion: string
}

export async function draftOne(post: { text: string; authorHandle: string }, deps: DraftDeps): Promise<DraftResult> {
  const results = searchKB(post.text)
  if (results.length === 0 || !isMatched(results[0].score)) {
    return { draft: null, reason: 'no_match', matchScore: results[0]?.score ?? 0, promptVersion: DRAFT_VERSION }
  }
  const top = results[0]
  const prompt = buildDraftFromArticlePrompt({
    post,
    article: { id: top.article.id, title: top.article.title, url: top.article.url },
    chunks: top.chunks,
  })
  const r = await deps.runPrompt({ prompt, timeoutMs: 90_000 })
  const parsed = parseDraftFromArticleResponse(r.text)
  return {
    draft: parsed,
    reason: 'matched',
    matchScore: top.score,
    articleId: top.article.id,
    promptVersion: DRAFT_VERSION,
  }
}
```

- [ ] **Step 6: Implement batch.ts**

```typescript
import type Database from 'better-sqlite3'
import { postsRepo, draftsRepo, accountsRepo, deadLetterRepo } from '@x-monitor/db'
import { aiTasksQ } from '@x-monitor/queue'
import { runPrompt } from '@x-monitor/claude-client'
import { analyzeOne } from './analyze.js'
import { draftOne } from './draft.js'
import { createHash } from 'node:crypto'

const MAX_BATCH = 20
const MAX_RETRIES = 3

export async function processBatch(db: Database.Database, log: { info: Function; error: Function }): Promise<{ processed: number }> {
  const account = accountsRepo(db).findByHandle('FinTax_Official')
  if (!account) throw new Error('FinTax_Official account not seeded')

  let processed = 0
  for (let i = 0; i < MAX_BATCH; i++) {
    const job = await aiTasksQ.getNextJob('ai-worker')
    if (!job) break
    try {
      const post = postsRepo(db).findById(job.data.postId)
      if (!post) { await job.moveToCompleted({ skipped: 'no post' }, 'ai-worker'); continue }

      postsRepo(db).updateStatus(post.id, 'analyzing')
      const analysis = await analyzeOne({ text: post.text, authorHandle: post.authorHandle }, { runPrompt })

      if (analysis.scenario === 'skip' || analysis.scenario !== '1') {
        postsRepo(db).updateStatus(post.id, 'no_match')
        await job.moveToCompleted({ scenario: analysis.scenario }, 'ai-worker')
        processed++; continue
      }

      const dr = await draftOne({ text: post.text, authorHandle: post.authorHandle }, { runPrompt })
      if (!dr.draft) {
        postsRepo(db).updateStatus(post.id, 'no_match')
        await job.moveToCompleted({ reason: 'no_match' }, 'ai-worker')
        processed++; continue
      }

      const idempKey = createHash('sha1').update(`${post.id}:${account.id}:${dr.draft.content}`).digest('hex')
      draftsRepo(db).insert({
        postId: post.id, accountId: account.id, content: dr.draft.content,
        format: 'single', citations: dr.draft.citations, strategy: null,
        status: 'pending', idempotencyKey: idempKey, promptVersion: dr.promptVersion,
      })
      postsRepo(db).updateStatus(post.id, 'matched_article')
      await job.moveToCompleted({ draftSaved: true }, 'ai-worker')
      processed++
      log.info('drafted', { postId: post.id, articleId: dr.articleId, traceId: post.traceId })
    } catch (e) {
      log.error('ai-task failed', { jobId: job.id, error: String(e) })
      const attemptsMade = job.attemptsMade + 1
      if (attemptsMade >= MAX_RETRIES) {
        deadLetterRepo(db).insert({
          taskType: 'ai-task',
          payload: JSON.stringify(job.data),
          lastError: String(e),
          retryCount: attemptsMade,
        })
        await job.moveToCompleted({ deadLettered: true }, 'ai-worker')
      } else {
        await job.moveToFailed(new Error(String(e)), 'ai-worker')
      }
    }
  }
  return { processed }
}
```

**Implementation note**: prefer the `Worker` class with `concurrency: 1` and a max-jobs counter rather than manual `getNextJob` — the Worker pattern is cleaner and well-documented. The above sketch is illustrative; rewrite using `new Worker(...)` that increments a counter and stops itself after `MAX_BATCH` jobs (or after the queue empties), then exits the loop in `index.ts`.

- [ ] **Step 7: Implement entry index.ts (PM2 long-runner mode)**

```typescript
import { getDb, migrate } from '@x-monitor/db'
import { createLogger, heartbeat } from '@x-monitor/observability'
import { getNetStatus } from '@x-monitor/queue'
import { processBatch } from './batch.js'

const db = getDb(); migrate(db)
const log = createLogger('ai-worker')

while (true) {
  const status = await getNetStatus()
  if (status !== 'HEALTHY') {
    log.warn('paused', { status })
    await new Promise(r => setTimeout(r, 30_000))
    continue
  }
  try {
    const r = await processBatch(db, log)
    log.info('batch complete', r)
    heartbeat(db, 'ai-worker', 'ok')
  } catch (e) {
    log.error('batch failed', { error: String(e) })
    heartbeat(db, 'ai-worker', 'error', String(e))
  }
  await new Promise(r => setTimeout(r, 60_000))
}
```

- [ ] **Step 8: Test, commit**

```bash
pnpm test
git add apps/ai-worker
git commit -m "feat(ai-worker): batch processing with claude -p"
```

---

### Task 15: `scheduler` app

**Files:**
- Create: `apps/scheduler/{package.json,tsconfig.json}`, `src/{index.ts,tick.ts}`
- Test: `tests/tick.test.ts`

- [ ] **Step 1: Boilerplate**

```bash
# name "@x-monitor/app-scheduler"
pnpm add @x-monitor/core@workspace:* @x-monitor/db@workspace:* \
         @x-monitor/queue@workspace:* @x-monitor/observability@workspace:* \
         @x-monitor/rules@workspace:*
```

- [ ] **Step 2: Failing test for tick**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { migrate, accountsRepo, postsRepo, draftsRepo, scheduledRepo } from '@x-monitor/db'
import { tick } from '../src/tick.js'

describe('scheduler.tick', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:'); migrate(db)
    accountsRepo(db).insert({
      handle: 'FinTax_Official', role: 'official',
      cookiesPath: '/tmp/cookies.json',
      dailyLimit: 30, minIntervalMin: 15,
      businessHours: { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' },
      cooldownUntil: null,
    })
    const postId = postsRepo(db).insert({
      tweetId: 't1', authorHandle: 'a', text: 'x',
      postedAt: 1000, lang: 'en', source: 'browser',
      scenarioHint: null, status: 'matched_article', traceId: 'tr1',
    })
    draftsRepo(db).insert({
      postId, accountId: 1, content: 'reply',
      format: 'single', citations: [], strategy: null,
      status: 'approved', idempotencyKey: 'k1', promptVersion: 'v1',
    })
  })
  afterEach(() => { db.close() })

  it('schedules an approved draft with no existing scheduled row', async () => {
    const enqueued: { draftId: number; delayMs: number }[] = []
    await tick({ db, now: new Date('2026-04-28T10:00:00+08:00').getTime(),
                 enqueue: (draftId, delayMs) => enqueued.push({ draftId, delayMs }) })
    const r = scheduledRepo(db).findByDraftId(1)
    expect(r).not.toBeNull()
    expect(enqueued).toHaveLength(1)
  })

  it('does not re-schedule already scheduled drafts', async () => {
    await tick({ db, now: Date.now(), enqueue: () => {} })
    const calls: any[] = []
    await tick({ db, now: Date.now(), enqueue: (d, m) => calls.push({ d, m }) })
    expect(calls).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Implement tick.ts**

```typescript
import type Database from 'better-sqlite3'
import { draftsRepo, scheduledRepo, accountsRepo, sentRepo } from '@x-monitor/db'
import { computeTargetSendAt } from '@x-monitor/rules'

export interface TickInput {
  db: Database.Database
  now: number
  enqueue: (draftId: number, delayMs: number) => void
}

export async function tick(i: TickInput): Promise<{ scheduled: number; enqueuedReady: number }> {
  let scheduled = 0
  // 1. Schedule unscheduled approved drafts
  const approvedUnscheduled = i.db.prepare(`
    SELECT d.id, d.account_id FROM drafts d
    LEFT JOIN scheduled s ON s.draft_id = d.id
    WHERE d.status = 'approved' AND s.draft_id IS NULL
  `).all() as { id: number; account_id: number }[]

  for (const d of approvedUnscheduled) {
    const acct = accountsRepo(i.db).findById(d.account_id)
    if (!acct || (acct.cooldownUntil && acct.cooldownUntil > i.now)) continue
    const lastSent = sentRepo(i.db).findLastForAccount(acct.id)?.sentAt ?? null
    const todayCount = sentRepo(i.db).countTodayForAccount(acct.id, i.now)
    const r = computeTargetSendAt({
      now: i.now, lastSentAt: lastSent,
      minIntervalMin: acct.minIntervalMin,
      dailyLimit: acct.dailyLimit, todayCount,
      businessHours: acct.businessHours,
    })
    scheduledRepo(i.db).upsert({ draftId: d.id, accountId: acct.id, targetSendAt: r.target, priority: 0 })
    scheduled++
  }

  // 2. Enqueue drafts whose time has come
  const ready = scheduledRepo(i.db).findReadyToSend(i.now)
  for (const r of ready) {
    i.enqueue(r.draftId, 0)
  }
  return { scheduled, enqueuedReady: ready.length }
}
```

- [ ] **Step 4: Implement entry index.ts**

```typescript
import { getDb, migrate } from '@x-monitor/db'
import { createLogger, heartbeat } from '@x-monitor/observability'
import { sendTasksQ, getNetStatus } from '@x-monitor/queue'
import { tick } from './tick.js'

const db = getDb(); migrate(db)
const log = createLogger('scheduler')

while (true) {
  if (await getNetStatus() === 'DOWN') {
    await new Promise(r => setTimeout(r, 30_000))
    continue
  }
  try {
    const r = await tick({
      db, now: Date.now(),
      enqueue: (draftId, delayMs) => { sendTasksQ.add('send', { draftId, traceId: String(draftId) }, { delay: delayMs }) },
    })
    log.info('tick', r)
    heartbeat(db, 'scheduler', 'ok')
  } catch (e) {
    log.error('tick failed', { error: String(e) })
    heartbeat(db, 'scheduler', 'error', String(e))
  }
  await new Promise(r => setTimeout(r, 30_000))
}
```

- [ ] **Step 5: Test, commit**

```bash
pnpm test
git add apps/scheduler
git commit -m "feat(scheduler): per-account drip scheduling"
```

---

### Task 16: `poster` app — dry-run send

**Files:**
- Create: `apps/poster/{package.json,tsconfig.json}`, `src/{index.ts,post.ts}`
- Test: `tests/post.test.ts`

For M1, poster runs in dry-run mode by default. Real xactions integration is wired up here too but gated by `POSTER_DRY_RUN`.

- [ ] **Step 1: Boilerplate**

```bash
# name "@x-monitor/app-poster"
pnpm add @x-monitor/core@workspace:* @x-monitor/db@workspace:* \
         @x-monitor/queue@workspace:* @x-monitor/observability@workspace:* \
         @x-monitor/x-client@workspace:*
```

- [ ] **Step 2: Failing test for sendOne**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate, accountsRepo, postsRepo, draftsRepo, sentRepo } from '@x-monitor/db'
import { createDryRunClient } from '@x-monitor/x-client'
import { sendOne } from '../src/post.js'

describe('sendOne', () => {
  let db: Database.Database
  let xc: ReturnType<typeof createDryRunClient>
  beforeEach(() => {
    db = new Database(':memory:'); migrate(db)
    accountsRepo(db).insert({
      handle: 'FinTax_Official', role: 'official', cookiesPath: '/tmp/c.json',
      dailyLimit: 30, minIntervalMin: 15,
      businessHours: { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' },
      cooldownUntil: null,
    })
    const postId = postsRepo(db).insert({
      tweetId: 't1', authorHandle: 'a', text: 'x', postedAt: 1000, lang: 'en',
      source: 'browser', scenarioHint: null, status: 'matched_article', traceId: 'tr',
    })
    draftsRepo(db).insert({
      postId, accountId: 1, content: 'reply',
      format: 'single', citations: [], strategy: null,
      status: 'approved', idempotencyKey: 'k', promptVersion: 'v1',
    })
    xc = createDryRunClient()
  })
  afterEach(() => { db.close() })

  it('posts and writes sent row', async () => {
    const r = await sendOne(db, xc, 1)
    expect(r.tweetId).toMatch(/^dry-/)
    expect(sentRepo(db).findByDraftId(1)).not.toBeNull()
    expect(draftsRepo(db).findById(1)?.status).toBe('sent')
  })

  it('is idempotent: running twice does not double-post', async () => {
    await sendOne(db, xc, 1)
    await sendOne(db, xc, 1)
    expect(xc.posted).toHaveLength(1)
    expect(sentRepo(db).findByDraftId(1)).not.toBeNull()
  })
})
```

- [ ] **Step 3: Implement post.ts**

```typescript
import type Database from 'better-sqlite3'
import type { XClient } from '@x-monitor/x-client'
import { draftsRepo, postsRepo, accountsRepo, sentRepo } from '@x-monitor/db'

export async function sendOne(db: Database.Database, xc: XClient, draftId: number): Promise<{ tweetId: string; skipped?: 'duplicate' }> {
  const d = draftsRepo(db).findById(draftId)
  if (!d) throw new Error(`draft ${draftId} not found`)
  // Idempotency: if a sent row already exists for this draft, return it.
  const existing = sentRepo(db).findByDraftId(draftId)
  if (existing) return { tweetId: existing.tweetId, skipped: 'duplicate' }

  const post = postsRepo(db).findById(d.postId)!
  const acct = accountsRepo(db).findById(d.accountId)!

  const r = await xc.postReply(post.tweetId, d.content, acct.handle)

  sentRepo(db).insert({
    draftId: d.id, tweetId: r.tweetId, accountId: acct.id, sentAt: Date.now(),
  })
  draftsRepo(db).updateStatus(d.id, 'sent')
  return { tweetId: r.tweetId }
}
```

- [ ] **Step 4: Implement index.ts**

```typescript
import { getDb, migrate } from '@x-monitor/db'
import { createLogger, heartbeat } from '@x-monitor/observability'
import { sendTasksQ, getNetStatus } from '@x-monitor/queue'
import { Worker } from 'bullmq'
import { connection } from '@x-monitor/queue'
import { createDryRunClient } from '@x-monitor/x-client'
import { sendOne } from './post.js'

const db = getDb(); migrate(db)
const log = createLogger('poster')

const xc = process.env.POSTER_DRY_RUN === '0'
  ? (() => { throw new Error('live X client not implemented in M1') })()
  : createDryRunClient()

new Worker('send-tasks', async (job) => {
  if (await getNetStatus() === 'DOWN') throw new Error('network down')
  const r = await sendOne(db, xc, job.data.draftId)
  log.info('sent', { draftId: job.data.draftId, tweetId: r.tweetId, traceId: job.data.traceId })
  heartbeat(db, 'poster', 'ok')
  return r
}, { connection, concurrency: 1 })

log.info('poster started', { dryRun: process.env.POSTER_DRY_RUN !== '0' })
```

- [ ] **Step 5: Test, commit**

```bash
pnpm test
git add apps/poster
git commit -m "feat(poster): idempotent send via dry-run X client"
```

---

### Task 17: `web-ui` app — Next.js review queue

**Files:**
- Create: `apps/web-ui/{package.json,tsconfig.json,next.config.mjs}`
- Create: `src/app/{layout.tsx,page.tsx}`, `src/app/pending/{page.tsx,[id]/page.tsx}`
- Create: `src/app/status/page.tsx`
- Create: `src/app/api/{pending/route.ts,pending/[id]/approve/route.ts,pending/[id]/reject/route.ts,status/route.ts,test/inject-post/route.ts}`
- Create: `src/lib/server.ts`
- Test: `tests/api.test.ts`

- [ ] **Step 1: Boilerplate**

```bash
cd apps/web-ui
pnpm add next react react-dom
pnpm add -D @types/react @types/react-dom
# workspace deps:
pnpm add @x-monitor/core@workspace:* @x-monitor/db@workspace:* @x-monitor/queue@workspace:*
```

`next.config.mjs`:
```javascript
export default {
  transpilePackages: ['@x-monitor/core', '@x-monitor/db', '@x-monitor/queue', '@x-monitor/observability'],
  webpack: (config) => {
    config.externals.push({ 'better-sqlite3': 'commonjs better-sqlite3' })
    return config
  },
}
```

(Note: Next 14 prefers `transpilePackages` over the older `experimental.externalDir`. List every workspace package the web-ui imports.)

- [ ] **Step 2: Implement lib/server.ts**

```typescript
import { getDb, migrate } from '@x-monitor/db'
const _db = (() => { const d = getDb(); migrate(d); return d })()
export const db = _db
```

- [ ] **Step 3: Implement /api/pending route**

`app/api/pending/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/server'
import { draftsRepo, postsRepo } from '@x-monitor/db'

export async function GET() {
  const drafts = draftsRepo(db).listByStatus('pending')
  const enriched = drafts.map(d => ({
    ...d,
    post: postsRepo(db).findById(d.postId),
  }))
  return NextResponse.json(enriched)
}
```

- [ ] **Step 4: Implement /api/pending/[id]/approve and /reject**

```typescript
// approve/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/server'
import { draftsRepo, auditRepo } from '@x-monitor/db'

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  draftsRepo(db).updateStatus(id, 'approved')
  auditRepo(db).log({ actor: 'user', action: 'approve', targetType: 'draft', targetId: id })
  return NextResponse.json({ ok: true })
}
```

(`reject` follows the same pattern with `'rejected'`.)

- [ ] **Step 5: Implement /api/test/inject-post (dev tool)**

```typescript
import { NextResponse } from 'next/server'
import { db } from '@/lib/server'
import { postsRepo } from '@x-monitor/db'
import { aiTasksQ } from '@x-monitor/queue'
import { newTraceId } from '@x-monitor/core'

export async function POST(req: Request) {
  const { text, authorHandle } = await req.json()
  const id = postsRepo(db).insert({
    tweetId: `manual-${Date.now()}`,
    authorHandle: authorHandle ?? 'tester',
    text,
    postedAt: Date.now(),
    lang: 'en',
    source: 'browser',
    scenarioHint: 'manual-injection',
    status: 'discovered',
    traceId: newTraceId(),
  })
  await aiTasksQ.add('analyze', { postId: id, traceId: newTraceId() })
  return NextResponse.json({ id })
}
```

- [ ] **Step 6: Implement /api/status**

Returns `system_health` rows + queue depths.

- [ ] **Step 7: Implement minimal pages**

- `app/page.tsx`: shows last 24h sent count, current pending count, system status summary
- `app/pending/page.tsx`: list of pending drafts with link to detail
- `app/pending/[id]/page.tsx`: full draft + post + citations, approve/reject buttons (POST to API)
- `app/status/page.tsx`: per-process heartbeat + queue depths
- Inject-post dev form (textarea on `/`)

Keep styling minimal — plain HTML + a few inline styles. Polish later.

- [ ] **Step 8: API smoke test**

`tests/api.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
// Test that the routes export functions and return 200/400 on basic inputs.
// Use Next's NextRequest mocking sparingly; this is a smoke layer only.
```

- [ ] **Step 9: Manual verify and commit**

```bash
pnpm --filter @x-monitor/app-web-ui dev  # http://localhost:3000
# Navigate to / — page renders
# POST inject-post with curl, see post in DB
git add apps/web-ui
git commit -m "feat(web-ui): pending review + inject-post + status"
```

---

### Task 18: Real xactions integration for scanner-browser and poster

**Files:**
- Modify: `packages/x-client/src/client.ts` (add live impl)
- Modify: `apps/scanner-browser/src/index.ts` (use live when env says)
- Modify: `apps/poster/src/index.ts`

This task wires the real xactions library + Chrome CDP for one account. Keep the dry-run path intact — selection is by env var.

- [ ] **Step 1: Inspect xactions API**

```bash
ls /Users/nightyoung/xactions/src/scrapers/twitter/
cat /Users/nightyoung/xactions/USAGE.md
```

Note in this task's commit message which xactions modules are used.

- [ ] **Step 2: Implement live XClient**

`packages/x-client/src/liveClient.ts`:
```typescript
// Pseudocode — adapt to actual xactions exports during implementation
import type { XClient } from './client.js'

export async function createLiveClient(opts: { cookiesPath: string; accountHandle: string }): Promise<XClient> {
  // 1. Load cookies via xactions
  // 2. Initialize Chrome CDP session (assumes Chrome with --remote-debugging-port)
  // 3. Return adapter that calls xactions.search() and xactions.postReply() via CDP
  // For postReply: use the existing technique from skills/x-article-publish (DraftJS clicks)
  throw new Error('TODO: implement during integration')
}
```

- [ ] **Step 3: Wire into scanner-browser and poster**

In `apps/scanner-browser/src/index.ts`:
```typescript
const xc = process.env.X_CLIENT_MODE === 'live'
  ? await createLiveClient({ cookiesPath: process.env.COOKIES_FINTAX_OFFICIAL!, accountHandle: 'FinTax_Official' })
  : createDryRunClient()
```

Same for poster: `POSTER_DRY_RUN === '0'` switches to live.

- [ ] **Step 4: Smoke test live mode against an internal sandbox account if available; otherwise leave dry-run as M1 default**

Document in README that M1 ships with dry-run on by default. Live mode is opt-in per `.env` settings.

- [ ] **Step 5: Commit**

```bash
git add packages/x-client apps/scanner-browser apps/poster
git commit -m "feat(x-client): live xactions integration (env-gated)"
```

---

### Task 19: PM2 ecosystem.config.cjs

**Files:**
- Create: `ecosystem.config.cjs`

- [ ] **Step 1: Write config**

```javascript
module.exports = {
  apps: [
    {
      name: 'network-health',
      script: 'apps/network-health/dist/index.js',
      autorestart: true,
      max_memory_restart: '200M',
      min_uptime: 5000,
      restart_delay: 3000,
      out_file: '.pm2/logs/network-health.out.log',
      error_file: '.pm2/logs/network-health.err.log',
    },
    {
      name: 'scanner-browser',
      script: 'apps/scanner-browser/dist/index.js',
      autorestart: true,
      max_memory_restart: '500M',
      min_uptime: 5000,
      restart_delay: 5000,
    },
    {
      name: 'ai-worker',
      script: 'apps/ai-worker/dist/index.js',
      autorestart: true,
      max_memory_restart: '500M',
      min_uptime: 5000,
      restart_delay: 5000,
    },
    {
      name: 'scheduler',
      script: 'apps/scheduler/dist/index.js',
      autorestart: true,
      max_memory_restart: '200M',
      min_uptime: 5000,
      restart_delay: 3000,
    },
    {
      name: 'poster',
      script: 'apps/poster/dist/index.js',
      autorestart: true,
      max_memory_restart: '500M',
      min_uptime: 5000,
      restart_delay: 5000,
    },
    {
      name: 'web-ui',
      cwd: 'apps/web-ui',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      autorestart: true,
      max_memory_restart: '500M',
    },
  ],
}
```

- [ ] **Step 2: Smoke test**

```bash
pnpm build
pm2 start ecosystem.config.cjs
pm2 list  # all 6 should be online
pm2 stop ecosystem.config.cjs
```

- [ ] **Step 3: Commit**

```bash
git add ecosystem.config.cjs
git commit -m "feat: PM2 ecosystem config for 6 processes"
```

---

### Task 20: launchd plist for macOS auto-start + caffeinate

**Files:**
- Create: `launchd/com.fintax.x-monitor.plist`
- Create: `launchd/install.sh`, `launchd/uninstall.sh`

- [ ] **Step 1: Write plist**

`launchd/com.fintax.x-monitor.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.fintax.x-monitor</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/sh</string>
        <string>-c</string>
        <string>/usr/bin/caffeinate -i /opt/homebrew/bin/pnpm --dir /Users/nightyoung/IdeaProjects/x-monitor dev</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/nightyoung/IdeaProjects/x-monitor/.pm2/logs/launchd.out.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/nightyoung/IdeaProjects/x-monitor/.pm2/logs/launchd.err.log</string>
</dict>
</plist>
```

- [ ] **Step 2: Install script**

`launchd/install.sh`:
```bash
#!/bin/bash
set -e
DEST=~/Library/LaunchAgents/com.fintax.x-monitor.plist
cp launchd/com.fintax.x-monitor.plist "$DEST"
launchctl load "$DEST"
echo "Loaded. To unload: launchctl unload $DEST"
```

(`uninstall.sh` mirrors with `launchctl unload`.)

- [ ] **Step 3: Document in `docs/runbook.md`**

How to install / verify / view logs / uninstall.

- [ ] **Step 4: Commit**

```bash
git add launchd docs/runbook.md
git commit -m "feat(launchd): macOS auto-start + caffeinate"
```

---

### Task 21: `inspect` CLI

**Files:**
- Create: `scripts/inspect.ts`

- [ ] **Step 1: Implement**

```typescript
#!/usr/bin/env tsx
import { getDb, migrate, postsRepo, draftsRepo, sentRepo, healthRepo } from '@x-monitor/db'

const db = getDb(); migrate(db)
const [, , cmd, arg] = process.argv

switch (cmd) {
  case 'post': {
    const id = parseInt(arg, 10)
    const post = postsRepo(db).findById(id)
    const drafts = db.prepare(`SELECT * FROM drafts WHERE post_id = ?`).all(id)
    const sent = db.prepare(`
      SELECT s.* FROM sent s JOIN drafts d ON d.id = s.draft_id WHERE d.post_id = ?
    `).all(id)
    console.log(JSON.stringify({ post, drafts, sent }, null, 2))
    break
  }
  case 'health': {
    const all = healthRepo(db).all()
    console.table(all)
    break
  }
  case 'pending': {
    const drafts = draftsRepo(db).listByStatus('pending')
    console.table(drafts.map(d => ({ id: d.id, postId: d.postId, content: d.content.slice(0, 60) })))
    break
  }
  default:
    console.error('Usage: inspect (post <id> | health | pending)')
    process.exit(1)
}
```

Add to root `package.json`:
```json
"scripts": { "inspect": "tsx scripts/inspect.ts" }
```

- [ ] **Step 2: Smoke test, commit**

```bash
pnpm inspect health
git add scripts/inspect.ts
git commit -m "feat(scripts): inspect CLI"
```

---

### Task 22: Claude Code routine entry + /schedule setup

**Files:**
- Create: `scripts/ai-routine.ts`
- Create: `docs/runbook.md` section on `/schedule` setup

- [ ] **Step 1: Implement routine entry**

`scripts/ai-routine.ts`:
```typescript
#!/usr/bin/env tsx
import { getDb, migrate } from '@x-monitor/db'
import { processBatch } from '@x-monitor/app-ai-worker'  // export from app
import { createLogger, heartbeat } from '@x-monitor/observability'

const db = getDb(); migrate(db)
const log = createLogger('ai-routine')
const r = await processBatch(db, log)
log.info('routine done', r)
heartbeat(db, 'ai-routine', 'ok')
process.exit(0)
```

To make this work, `processBatch` must be importable from outside the app:

1. Move `processBatch` from `apps/ai-worker/src/batch.ts` to be re-exported via a separate `apps/ai-worker/src/lib.ts` (or just `index.ts` if it stays library-shaped).
2. Add to `apps/ai-worker/package.json`:
   ```json
   "exports": {
     "./lib": "./dist/lib.js"
   },
   "main": "./dist/index.js"
   ```
3. Import as: `import { processBatch } from '@x-monitor/app-ai-worker/lib'`

Alternatively, move `processBatch` into a new shared package `packages/ai-worker-lib` if you find apps-as-libraries awkward — that's the cleaner refactor and worth doing if multiple entry points (PM2 process + routine + on-demand) need to call it.

- [ ] **Step 2: Document /schedule setup in runbook**

Add section to `docs/runbook.md`:

```
## Production AI worker via Claude Code routine

In Claude Code:
1. /schedule create
2. Cron: */5 * * * *
3. Command: cd /Users/nightyoung/IdeaProjects/x-monitor && pnpm tsx scripts/ai-routine.ts
4. Save

For dev, the PM2 ai-worker process polls every minute. Disable it (pm2 stop ai-worker) when the routine is configured.
```

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-routine.ts docs/runbook.md apps/ai-worker
git commit -m "feat: Claude Code routine entry for ai-worker"
```

---

## End-to-end smoke test (manual, after all tasks)

This is not its own task; it's the acceptance test for M1.

1. `redis-server` running on `localhost:6379`
2. `pnpm install && pnpm build && pnpm test` all green
3. `pnpm seed` (seeds FinTax_Official account)
4. `pm2 start ecosystem.config.cjs` (5 processes + web-ui in dry-run)
5. Open `http://localhost:3000` — overview page loads
6. POST to `/api/test/inject-post` with body `{"text":"How are staking rewards taxed?","authorHandle":"alice"}`
7. Within 60s: `pnpm inspect post 1` shows `status: matched_article` and a draft
8. In web-ui `/pending`: see one row, click in, click "Approve"
9. Within 30s: scheduler logs show "scheduled" entry
10. When target_send_at is reached: poster logs show "sent", `pnpm inspect post 1` shows a sent row
11. Stop Wi-Fi: within 5min, network-health publishes DEGRADED → workers go quiet
12. Restart Wi-Fi: workers resume; verify by injecting another post
13. `pm2 stop poster && sleep 3 && pm2 list` — poster auto-restarts, Telegram alert fires (if configured)

---

## Notes for the implementing engineer

- **Use the dry-run path for everything you can.** Live xactions integration touches a real X account; only test it when explicitly verifying that path.
- **Each task is one branch and one PR if you want, or just commits on main.** This is a single-developer codebase, but commits should still follow the cadence above.
- **When BullMQ semantics surprise you,** check the version that `pnpm install` resolved and read its README. The `getNextJob` in Task 14 may need tweaks; alternative is using the `Worker` class with concurrency 1 — that's probably cleaner.
- **The XClient interface deliberately abstracts xactions.** If xactions's API doesn't fit, adapt within `packages/x-client` — the rest of the system shouldn't know.
- **TZ handling.** `withinBusinessHours` uses `Intl.DateTimeFormat` with the TZ name — Node 20 supports this without polyfill. The `nextBusinessStart` helper in Task 9 hard-codes Asia/Shanghai for M1; generalize when M2 adds multi-tz accounts.
- **Tests requiring Redis** must be marked or skipped when CI/dev doesn't have Redis. M1 assumes the developer has `brew services start redis`. Document this in README.
- **Don't add features beyond M1 scope** even when tempting. M2 plan will follow.
