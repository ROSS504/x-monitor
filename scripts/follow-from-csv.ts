#!/usr/bin/env tsx
/**
 * Follow a list of X handles from a CSV file. Uses xactions's logged-in browser
 * with our intern cookies. Detects "Follow" vs "Following" via data-testid.
 *
 * Usage:
 *   pnpm tsx scripts/follow-from-csv.ts <csv-path> [columnIndex=3] [cookiesPath]
 *
 * CSV expected: any row whose <columnIndex> cell contains an X handle (with or
 * without leading @). Empty cells are skipped.
 */
import { readFileSync } from 'node:fs'
import { createBrowser, createPage } from 'xactions'

interface CookieEntry { name: string; value: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean }

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('Usage: pnpm tsx scripts/follow-from-csv.ts <csv-path> [columnIndex=3] [cookiesPath]')
  process.exit(1)
}
const colIdx = parseInt(process.argv[3] ?? '3', 10)
const cookiesPath = process.argv[4] ?? '/Users/nightyoung/twitter_cookies_fintax_intern.json'

const csv = readFileSync(csvPath, 'utf8')
const rows = csv.split(/\r?\n/).filter(l => l.trim())
const handles: { handle: string; name: string; company: string }[] = []
for (let i = 1; i < rows.length; i++) {
  const cols = rows[i].split(',')
  const cell = (cols[colIdx] ?? '').trim()
  if (!cell || !/[A-Za-z@]/.test(cell)) continue
  const handle = cell.replace(/^@/, '').replace(/[\s]+/g, '')
  if (!handle) continue
  handles.push({ handle, name: cols[1] ?? '', company: cols[0] ?? '' })
}
console.log(`[follow] ${handles.length} handles found in CSV column ${colIdx}`)

const cookies = JSON.parse(readFileSync(cookiesPath, 'utf8')) as CookieEntry[]
const browser = await createBrowser({ headless: process.env.HEADLESS !== '0' }) as any
const page = await createPage(browser) as any
await page.setCookie(...cookies.map(c => ({
  name: c.name, value: c.value, domain: c.domain ?? '.x.com', path: c.path ?? '/',
  secure: c.secure ?? true, httpOnly: c.httpOnly ?? false,
})))

let followed = 0
let already = 0
let notFound = 0
let failed = 0

for (let i = 0; i < handles.length; i++) {
  const { handle, name, company } = handles[i]
  const tag = `[${i + 1}/${handles.length}] @${handle} (${name}, ${company})`
  try {
    await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
    await new Promise(r => setTimeout(r, 2500))

    const result = (await page.evaluate(`
      (function() {
        // Profile not found
        if (/不存在|doesn't exist|account suspended|账号已被冻结/.test(document.body.textContent || '')) {
          return { kind: 'not-found' };
        }
        // Find the user-action button on the profile (one labeled with this user's id)
        var btns = Array.prototype.slice.call(document.querySelectorAll('[data-testid$="-follow"], [data-testid$="-unfollow"]'));
        for (var i = 0; i < btns.length; i++) {
          var t = btns[i].getAttribute('data-testid') || '';
          if (t.endsWith('-unfollow')) return { kind: 'already' };
        }
        for (var j = 0; j < btns.length; j++) {
          var t2 = btns[j].getAttribute('data-testid') || '';
          if (t2.endsWith('-follow')) {
            btns[j].click();
            return { kind: 'clicked', testid: t2 };
          }
        }
        return { kind: 'no-button' };
      })()
    `)) as any

    if (result.kind === 'already') {
      console.log(`${tag} -> already following`); already++
    } else if (result.kind === 'not-found') {
      console.log(`${tag} -> profile not found`); notFound++
    } else if (result.kind === 'no-button') {
      console.log(`${tag} -> no follow button (private/blocked?)`); failed++
    } else if (result.kind === 'clicked') {
      // Wait for confirmation modal (rare) or for the button state to flip
      await new Promise(r => setTimeout(r, 1500))
      // X may pop a "are you sure?" dialog for some accounts (rare, only for protected). Auto-confirm if present.
      const confirmed = (await page.evaluate(`
        (function() {
          var modal = document.querySelector('[data-testid="confirmationSheetConfirm"]');
          if (modal) { modal.click(); return true; }
          return false;
        })()
      `)) as boolean
      if (confirmed) await new Promise(r => setTimeout(r, 1000))
      console.log(`${tag} -> followed`); followed++
    }
  } catch (e) {
    console.log(`${tag} -> ERROR ${String(e).slice(0, 100)}`); failed++
  }

  // Throttle to avoid X rate limits
  await new Promise(r => setTimeout(r, 2500 + Math.random() * 1500))
}

console.log(`\n[follow] done.`)
console.log(`  followed:        ${followed}`)
console.log(`  already_follow:  ${already}`)
console.log(`  not_found:       ${notFound}`)
console.log(`  failed:          ${failed}`)
console.log(`  total:           ${handles.length}`)

await browser.close()
process.exit(0)
