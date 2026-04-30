#!/usr/bin/env tsx
import { readFileSync } from 'node:fs'
import { createBrowser, createPage } from 'xactions'

const cookies = JSON.parse(readFileSync('/Users/nightyoung/twitter_cookies_fintax_intern.json', 'utf8'))
const browser = await createBrowser({ headless: true }) as any
const page = await createPage(browser) as any
await page.setCookie(...cookies.map((c: any) => ({
  name: c.name, value: c.value, domain: c.domain ?? '.x.com', path: c.path ?? '/', secure: true, httpOnly: c.httpOnly ?? false,
})))

const URLS = [
  ['V0',   'https://x.com/FinTax_Intern/status/2049310705422414260'],
  ['V199', 'https://x.com/FinTax_Intern/status/2046528547645231326'],
]

for (const [tag, url] of URLS) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 })
  await new Promise(r => setTimeout(r, 3000))
  const info = await page.evaluate(`
    (function() {
      var article = document.querySelector('article[data-testid="tweet"]');
      if (!article) return { error: 'no article' };
      // engagement bar labels
      var labels = {};
      ['reply','retweet','unretweet','like','unlike','bookmark','removeBookmark'].forEach(function(t){
        var e = article.querySelector('[data-testid="' + t + '"]');
        if (e) labels[t] = e.getAttribute('aria-label');
      });
      // any element labeled with views/浏览/次
      var viewLabels = [];
      article.querySelectorAll('[aria-label]').forEach(function(e) {
        var l = e.getAttribute('aria-label') || '';
        if (/view|浏览|次/i.test(l) && /\\d/.test(l) && l.length < 80) viewLabels.push(l);
      });
      // is it a reply context? look for "Replying to" indicator
      var replyingTo = null;
      var reply = document.querySelector('[data-testid="socialContext"]');
      if (reply) replyingTo = reply.textContent;
      // analytics link presence
      var analyticsLink = document.querySelector('a[aria-label*="View post analytics"]') !== null;
      return { labels: labels, viewLabels: viewLabels, replyingTo: replyingTo, analyticsLink: analyticsLink };
    })()
  `) as any
  console.log(`\n=== ${tag}: ${url} ===`)
  console.log('replyingTo:', info.replyingTo ?? '(none)')
  console.log('analyticsLink:', info.analyticsLink)
  console.log('engagement labels:', info.labels)
  console.log('view labels:', info.viewLabels)
}

await browser.close()
process.exit(0)
