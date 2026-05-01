#!/usr/bin/env tsx
import { readFileSync } from 'node:fs'
import { createBrowser, createPage } from 'xactions'

const tweetUrl = process.argv[2] ?? 'https://x.com/FinTax_Intern/status/2050125479467004052'
const cookies = JSON.parse(readFileSync('/Users/nightyoung/twitter_cookies_fintax_intern.json', 'utf8'))
const browser = await createBrowser({ headless: true }) as any
const page = await createPage(browser) as any
await page.setCookie(...cookies.map((c: any) => ({
  name: c.name, value: c.value, domain: c.domain ?? '.x.com', path: c.path ?? '/', secure: true, httpOnly: c.httpOnly ?? false,
})))
await page.goto(tweetUrl, { waitUntil: 'networkidle2', timeout: 30_000 })
await new Promise(r => setTimeout(r, 3000))
const info = await page.evaluate(`
  (function() {
    var arts = document.querySelectorAll('article[data-testid="tweet"]');
    var out = [];
    for (var i = 0; i < arts.length; i++) {
      var textEl = arts[i].querySelector('[data-testid="tweetText"]');
      var unameLink = arts[i].querySelector('[data-testid="User-Name"] a[href^="/"]');
      var time = arts[i].querySelector('time');
      var anchors = arts[i].querySelectorAll('a[href*="/status/"]');
      var perma = '';
      for (var j = 0; j < anchors.length; j++) {
        var h = anchors[j].getAttribute('href') || '';
        if (/^\\/[^/]+\\/status\\/\\d+$/.test(h)) { perma = h; break; }
      }
      out.push({
        idx: i,
        author: unameLink ? unameLink.getAttribute('href') : '?',
        text: textEl ? textEl.textContent.slice(0, 120) : null,
        time: time ? time.getAttribute('datetime') : '',
        perma: perma,
      });
    }
    return { url: window.location.href, articles: out };
  })()
`) as any
console.log(JSON.stringify(info, null, 2))
await browser.close()
process.exit(0)
