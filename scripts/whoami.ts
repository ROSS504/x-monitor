#!/usr/bin/env tsx
import { readFileSync } from 'node:fs'
import { createBrowser, createPage } from 'xactions'

interface CookieEntry {
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expirationDate?: number
}

const FILES = [
  '/Users/nightyoung/twitter_cookies_fintax_cn.json',
  '/Users/nightyoung/twitter_cookies_fintax_en.json',
  '/Users/nightyoung/twitter_cookies_new.json',
  '/Users/nightyoung/twitter_cookies.json',
]

function loadCookies(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as CookieEntry[]
}

const browser = await createBrowser({ headless: true })

for (const f of FILES) {
  const cookies = loadCookies(f)
  const page = await createPage(browser) as any
  try {
    // Set ALL cookies, not just auth_token (ct0 + auth_token together is required by X)
    await page.setCookie(...cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain ?? '.x.com',
      path: c.path ?? '/',
      secure: c.secure ?? true,
      httpOnly: c.httpOnly ?? false,
    })))
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 20_000 })
    await new Promise(r => setTimeout(r, 3000))
    // Extract handle from the AccountSwitcher / profile link
    const handle = await page.evaluate(() => {
      const a = document.querySelector('[data-testid="AppTabBar_Profile_Link"]')
      const href = a?.getAttribute('href') ?? ''
      return href.replace(/^\//, '')
    })
    console.log(`${f.split('/').pop()} -> @${handle || '(not logged in / expired)'}`)
  } catch (e) {
    console.log(`${f.split('/').pop()} -> ERROR ${String(e).slice(0, 80)}`)
  } finally {
    await page.close()
  }
}

await browser.close()
process.exit(0)
