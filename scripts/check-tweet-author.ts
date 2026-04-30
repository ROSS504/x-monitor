#!/usr/bin/env tsx
import { readFileSync } from 'node:fs'
import { createBrowser, createPage } from 'xactions'

const cookies = JSON.parse(readFileSync('/Users/nightyoung/twitter_cookies_fintax_intern.json', 'utf8'))
const browser = await createBrowser({ headless: true }) as any
const page = await createPage(browser) as any
await page.setCookie(...cookies.map((c: any) => ({
  name: c.name, value: c.value, domain: c.domain ?? '.x.com', path: c.path ?? '/', secure: true, httpOnly: c.httpOnly ?? false,
})))
await page.goto('https://x.com/FinTax_Intern/status/2044857116897526192', { waitUntil: 'networkidle2', timeout: 30_000 })
await new Promise(r => setTimeout(r, 3000))
const info = await page.evaluate(`
  (function() {
    var article = document.querySelector('article[data-testid="tweet"]');
    if (!article) return { error: 'no article' };
    var userNameLinks = Array.prototype.slice.call(article.querySelectorAll('[data-testid="User-Name"] a[href^="/"]'));
    var authors = userNameLinks.map(function(a){ return a.getAttribute('href'); });
    var social = article.querySelector('[data-testid="socialContext"]');
    var url = window.location.href;
    return { authors: authors, socialContext: social ? social.textContent : null, url: url };
  })()
`) as any
console.log(JSON.stringify(info, null, 2))
await browser.close()
process.exit(0)
