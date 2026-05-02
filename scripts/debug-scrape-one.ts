#!/usr/bin/env tsx
/**
 * Diagnostic: scrape ONE handle, dump page HTML on failure so we can
 * see whether X served a login wall, a "are you a robot" check, or
 * just a slow render.
 *
 * Usage: tsx scripts/debug-scrape-one.ts [handle=brian_armstrong]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createBrowser, createPage } from 'xactions'

const handle = process.argv[2] ?? 'brian_armstrong'
const cookiesPath = process.env.COOKIES_FINTAX_INTERN
  ?? '/Users/nightyoung/twitter_cookies_fintax_intern.json'

interface CookieEntry { name: string; value: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean }

const cookies = JSON.parse(readFileSync(cookiesPath, 'utf8')) as CookieEntry[]
const browser = await createBrowser({ headless: process.env.HEADLESS !== '0' }) as any
const page = await createPage(browser) as any
await page.setCookie(...cookies.map(c => ({
  name: c.name, value: c.value, domain: c.domain ?? '.x.com', path: c.path ?? '/',
  secure: c.secure ?? true, httpOnly: c.httpOnly ?? false,
})))

const url = `https://x.com/${handle}/with_replies`
console.log(`[debug] cookies=${cookies.length}, navigating to ${url}`)

const t0 = Date.now()
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
console.log(`[debug] domcontentloaded after ${Date.now() - t0}ms`)

// Dump page state at intervals so we can see what X actually serves us.
for (const waitMs of [2000, 5000, 10000, 20000]) {
  await new Promise(r => setTimeout(r, waitMs - (waitMs === 2000 ? 0 : (waitMs === 5000 ? 2000 : (waitMs === 10000 ? 5000 : 10000)))))
  const stats = await page.evaluate(() => {
    const articles = document.querySelectorAll('article')
    const articlesByTestId = document.querySelectorAll('article[data-testid="tweet"]')
    const allTestIds = Array.from(new Set(
      Array.from(document.querySelectorAll('[data-testid]')).map(e => e.getAttribute('data-testid')),
    )).filter(Boolean).slice(0, 30)
    const cookieBanner = document.body.textContent?.includes('Sign up') || document.body.textContent?.includes('Log in')
    const titleText = document.title
    const url = location.href
    const bodyHtmlSize = document.body.outerHTML.length
    return { articleCount: articles.length, articleTestIdCount: articlesByTestId.length, allTestIds, hasSignUp: cookieBanner, titleText, url, bodyHtmlSize }
  })
  console.log(`[debug] @t=${waitMs}ms: title="${stats.titleText}", url=${stats.url}`)
  console.log(`         articleAny=${stats.articleCount}, articleByTestId=${stats.articleTestIdCount}, hasLoginText=${stats.hasSignUp}, bodyBytes=${stats.bodyHtmlSize}`)
  console.log(`         testIds: ${stats.allTestIds.slice(0, 12).join(', ')}`)
}

const html = await page.content()
const path = `/tmp/debug-${handle}.html`
writeFileSync(path, html)
console.log(`[debug] wrote full HTML (${html.length} bytes) to ${path}`)

await browser.close()
process.exit(0)
