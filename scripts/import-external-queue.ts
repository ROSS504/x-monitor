#!/usr/bin/env tsx
/**
 * Import external publishing queues (markdown files with i=N entries) into
 * the system as posts + drafts. Each queue item becomes:
 *   - one row in `posts` (the source tweet being replied to, possibly already there)
 *   - one row in `drafts` (status=pending, format=thread, strategy=external-queue)
 *
 * Both Chinese and English file formats are supported (auto-detected by
 * presence of "Tweet 1:" / "段 1：").
 *
 * Usage: pnpm tsx scripts/import-external-queue.ts <file1> [file2] ...
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { getDb, migrate, postsRepo, draftsRepo, accountsRepo } from '@x-monitor/db'
import { newTraceId } from '@x-monitor/core'

interface QueueItem {
  i: number
  sourceUrl: string
  sourceAuthor: string
  sourceTweetId: string
  parts: string[]   // each Tweet/段 of the reply
  lang: 'zh' | 'en'
}

function parseQueue(filePath: string): QueueItem[] {
  const raw = readFileSync(filePath, 'utf8')
  const isChinese = /段\s*1[：:]/.test(raw)
  const lang: 'zh' | 'en' = isChinese ? 'zh' : 'en'

  // Split on `## i=N` markers (header + maybe handle)
  const blocks = raw.split(/\n## i=(\d+)/).slice(1)
  // After split: [iNum, body, iNum, body, ...]
  const items: QueueItem[] = []
  for (let k = 0; k < blocks.length; k += 2) {
    const i = parseInt(blocks[k], 10)
    const body = blocks[k + 1] ?? ''
    const m = body.match(/https?:\/\/x\.com\/([^/]+)\/status\/(\d+)/)
    if (!m) continue
    const sourceAuthor = m[1]
    const sourceTweetId = m[2]
    // Extract reply parts: lines starting with "**Tweet N**:" or "**段 N：**"
    const partRegex = isChinese
      ? /\*\*段\s*\d+\s*[：:]\*\*\s*([\s\S]*?)(?=\n\*\*段\s*\d+|\n\n---|\n## i=|$)/g
      : /\*\*Tweet\s*\d+\*\*:\s*([\s\S]*?)(?=\n\*\*Tweet\s*\d+|\n\n---|\n## i=|$)/g
    const parts: string[] = []
    let pm: RegExpExecArray | null
    while ((pm = partRegex.exec(body)) !== null) {
      parts.push(pm[1].trim())
    }
    if (parts.length === 0) continue
    items.push({ i, sourceUrl: m[0], sourceAuthor, sourceTweetId, parts, lang })
  }
  return items
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Usage: pnpm tsx scripts/import-external-queue.ts <file1> [file2] ...')
  process.exit(1)
}

const db = getDb(); migrate(db)

// Find or create FinTax_Intern account
let internAccount = accountsRepo(db).findByHandle('FinTax_Intern')
if (!internAccount) {
  const id = accountsRepo(db).insert({
    handle: 'FinTax_Intern',
    role: 'personal',
    cookiesPath: '/Users/nightyoung/twitter_cookies_fintax_intern.json',
    dailyLimit: 30,
    minIntervalMin: 15,
    businessHours: { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' },
    cooldownUntil: null,
  })
  console.log(`[import] created account FinTax_Intern with id=${id}`)
  internAccount = accountsRepo(db).findById(id)!
} else {
  console.log(`[import] reusing existing FinTax_Intern account id=${internAccount.id}`)
}

let totalItems = 0
let totalDraftsInserted = 0
let totalDraftsSkipped = 0
let totalPostsInserted = 0

for (const file of files) {
  console.log(`\n[import] parsing ${file}`)
  const items = parseQueue(file)
  console.log(`[import]   ${items.length} items found (lang=${items[0]?.lang ?? '?'})`)
  totalItems += items.length

  for (const it of items) {
    // Find or insert source post
    let post = db.prepare(`SELECT id FROM posts WHERE tweet_id = ?`).get(it.sourceTweetId) as { id: number } | undefined
    let postId: number
    if (post) {
      postId = post.id
    } else {
      postId = postsRepo(db).insert({
        tweetId: it.sourceTweetId,
        authorHandle: it.sourceAuthor,
        text: '(source not yet scraped — see x.com URL)',
        postedAt: Date.now(),
        lang: it.lang,
        source: 'external-queue',
        scenarioHint: `external-queue:${it.lang}`,
        status: 'matched_article',
        traceId: newTraceId(),
      })
      totalPostsInserted++
    }

    // Build draft content: join all Tweet/段 with double newline
    const content = it.parts.join('\n\n')
    const idempKey = createHash('sha1').update(`external:${file}:i=${it.i}:${it.sourceTweetId}`).digest('hex')

    // Skip if draft with this idempotency key exists
    const dup = db.prepare(`SELECT id FROM drafts WHERE idempotency_key = ?`).get(idempKey) as { id: number } | undefined
    if (dup) { totalDraftsSkipped++; continue }

    draftsRepo(db).insert({
      postId,
      accountId: internAccount.id,
      content,
      format: 'thread',
      citations: [],
      strategy: 'external-queue',
      status: 'pending',
      idempotencyKey: idempKey,
      promptVersion: `external:${file.split('/').pop()}:i=${it.i}`,
    })
    totalDraftsInserted++
  }
}

console.log(`\n[import] done.`)
console.log(`  items processed: ${totalItems}`)
console.log(`  source posts inserted: ${totalPostsInserted}`)
console.log(`  drafts inserted: ${totalDraftsInserted}`)
console.log(`  drafts skipped (dup): ${totalDraftsSkipped}`)
process.exit(0)
