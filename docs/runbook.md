# X Monitor Runbook

## Prereqs

- macOS, Apple Silicon (Homebrew at `/opt/homebrew`) or Intel
- Node.js 20+ (`/opt/homebrew/bin/node`)
- pnpm 9.0.0 (`pnpm install -g pnpm@9.0.0`)
- PM2 (`npm install -g pm2`)
- Redis: `brew install redis && brew services start redis`
- (Optional) Telegram bot token + chat id for alerts

## First-time setup

```bash
cd /Users/nightyoung/IdeaProjects/x-monitor
cp .env.example .env  # edit the bot token, cookies path if needed
pnpm install
pnpm -r --filter='./packages/*' --filter='./apps/*' build
pnpm seed              # creates FinTax_Official account
```

## Start everything (foreground PM2)

```bash
pm2 start ecosystem.config.cjs
pm2 list               # verify 6 processes online
pm2 logs               # tail all logs
```

Stop:

```bash
pm2 stop ecosystem.config.cjs
pm2 delete ecosystem.config.cjs
```

## Auto-start at login (launchd)

```bash
bash launchd/install.sh
```

This loads `~/Library/LaunchAgents/com.fintax.x-monitor.plist`, which runs
`caffeinate -i pm2 start ecosystem.config.cjs --no-daemon` at login and keeps it
running. `caffeinate -i` blocks system idle sleep so the workers keep ticking
when the lid is closed.

Uninstall:

```bash
bash launchd/uninstall.sh
```

Logs: `tail -f .pm2/logs/launchd.{out,err}.log`

## Inspect state

```bash
pnpm inspect health           # heartbeat per process
pnpm inspect pending          # drafts awaiting review
pnpm inspect post <id>        # full lineage of one post
```

## Web UI

`http://localhost:3000`

- `/` overview + dev "inject test post" form
- `/pending` review queue
- `/pending/:id` approve / reject
- `/status` per-process heartbeat

## Inject a test post (dev)

```bash
curl -XPOST http://localhost:3000/api/test/inject-post \
  -H 'content-type: application/json' \
  -d '{"text":"How are crypto staking rewards taxed?","authorHandle":"alice"}'
```

ai-worker picks it up within ~60s, KB-matches and drafts a reply, draft appears
in `/pending`.

## Production AI worker via Claude Code routine

The PM2 `ai-worker` process polls every 60s as a fallback. The plan's
preferred production setup uses a Claude Code routine that fires every 5–10 min
and runs the same `processBatch()` once per fire.

In the Claude Code CLI (local, not claude.ai cloud routines):

```
/schedule create
> Cron: */5 * * * *
> Command: cd /Users/nightyoung/IdeaProjects/x-monitor && pnpm tsx scripts/ai-routine.ts
```

When the routine is wired up, stop the PM2 ai-worker:

```bash
pm2 stop ai-worker
```

(Leave it running if you don't trust the routine yet — both can coexist; BullMQ
will only deliver each job once.)

## Going live (xactions integration)

Default state of the system is **dry-run** (`POSTER_DRY_RUN=1`,
`X_CLIENT_MODE=dry`). To enable real X posting:

1. Make sure cookies file is present and valid:
   ```bash
   ls $COOKIES_FINTAX_OFFICIAL  # default: /Users/nightyoung/twitter_cookies_fintax_en.json
   ```
2. Update `ecosystem.config.cjs` `SHARED_ENV`:
   ```
   POSTER_DRY_RUN: '0',
   X_CLIENT_MODE: 'live',
   ```
3. Restart everything: `pm2 restart ecosystem.config.cjs`

There is currently no live xactions implementation. `apps/scanner-browser` and
`apps/poster` will throw `live X client not implemented in M1` if you flip the
env without writing the live client first.

## Troubleshooting

**`Cannot find module 'better-sqlite3'`** — re-run `pnpm install` and rebuild:
```bash
pnpm install
pnpm -r --filter='./packages/*' --filter='./apps/*' build
```

**Web-UI 500** — usually a missing native module. `pnpm --filter
@x-monitor/app-web-ui add better-sqlite3` and `next build` again.

**ai-worker says "skipped missing post"** — the BullMQ queue has a stale job
referring to a postId that no longer exists in SQLite. Reset:
```bash
redis-cli DEL bull:ai-tasks:* bull:send-tasks:*
```
or, more thorough, `pm2 stop ecosystem.config.cjs && rm -f data/x-monitor.db
&& pnpm seed && pm2 start ecosystem.config.cjs`.

**Network probes always return down** — `https://1.1.1.1/` may be blocked on
some VPNs. Edit `apps/network-health/src/probe.ts` to use a different probe.
