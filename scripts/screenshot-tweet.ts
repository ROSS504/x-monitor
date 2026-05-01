#!/usr/bin/env tsx
import { readFileSync } from 'node:fs'
import { createBrowser, createPage } from 'xactions'

const url = process.argv[2] ?? 'https://x.com/FinTax_Intern/status/2050125479467004052'
const out = process.argv[3] ?? '/tmp/intern-reply.png'
const cookies = JSON.parse(readFileSync('/Users/nightyoung/twitter_cookies_fintax_intern.json', 'utf8'))
const browser = await createBrowser({ headless: true }) as any
const page = await createPage(browser) as any
await page.setCookie(...cookies.map((c: any) => ({
  name: c.name, value: c.value, domain: c.domain ?? '.x.com', path: c.path ?? '/', secure: true, httpOnly: c.httpOnly ?? false,
})))
await page.setViewport({ width: 800, height: 1200 })
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 })
await new Promise(r => setTimeout(r, 3500))
await page.screenshot({ path: out, fullPage: false })
console.log(`saved ${out}`)
await browser.close()
process.exit(0)
