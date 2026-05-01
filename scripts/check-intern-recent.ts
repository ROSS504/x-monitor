#!/usr/bin/env tsx
import { readFileSync } from 'node:fs'
import { createBrowser, createPage } from 'xactions'

const cookies = JSON.parse(readFileSync('/Users/nightyoung/twitter_cookies_fintax_intern.json', 'utf8'))
const browser = await createBrowser({ headless: true }) as any
const page = await createPage(browser) as any
await page.setCookie(...cookies.map((c: any) => ({
  name: c.name, value: c.value, domain: c.domain ?? '.x.com', path: c.path ?? '/', secure: true, httpOnly: c.httpOnly ?? false,
})))
await page.goto('https://x.com/FinTax_Intern/with_replies', { waitUntil: 'networkidle2', timeout: 30_000 })
await new Promise(r => setTimeout(r, 3000))
const recent = await page.evaluate(`
  (function() {
    var arts = document.querySelectorAll('article[data-testid="tweet"]');
    var out = [];
    for (var i = 0; i < Math.min(arts.length, 5); i++) {
      var unameLink = arts[i].querySelector('[data-testid="User-Name"] a[href^="/"]');
      var anchors = arts[i].querySelectorAll('a[href*="/status/"]');
      var perma = '';
      for (var j = 0; j < anchors.length; j++) {
        var h = anchors[j].getAttribute('href') || '';
        if (/^\\/[^/]+\\/status\\/\\d+$/.test(h)) { perma = h; break; }
      }
      var social = arts[i].querySelector('[data-testid="socialContext"]');
      var time = arts[i].querySelector('time');
      out.push({
        author: unameLink ? unameLink.getAttribute('href') : '?',
        permalink: perma,
        socialContext: social ? social.textContent : '',
        time: time ? time.getAttribute('datetime') : '',
      });
    }
    return out;
  })()
`) as any[]
console.log(JSON.stringify(recent, null, 2))
await browser.close()
process.exit(0)
