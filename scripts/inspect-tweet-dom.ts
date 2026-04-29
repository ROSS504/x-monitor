#!/usr/bin/env tsx
import { readFileSync } from 'node:fs'
import { createBrowser, createPage } from 'xactions'

const cookies = JSON.parse(readFileSync('/Users/nightyoung/twitter_cookies_fintax_intern.json', 'utf8'))
const browser = await createBrowser({ headless: true }) as any
const page = await createPage(browser) as any
await page.setCookie(...cookies.map((c: any) => ({
  name: c.name, value: c.value, domain: c.domain ?? '.x.com', path: c.path ?? '/', secure: true, httpOnly: c.httpOnly ?? false,
})))
await page.goto('https://x.com/FinTax_Intern/status/2049310705422414260', { waitUntil: 'networkidle2', timeout: 30_000 })
await new Promise(r => setTimeout(r, 5000))
const labels = await page.evaluate(`
  (function() {
    var url = window.location.href;
    var articles = document.querySelectorAll('article');
    var testIds = [];
    document.querySelectorAll('[data-testid]').forEach(function(e) {
      testIds.push(e.getAttribute('data-testid'));
    });
    var uniqueTestIds = Array.from(new Set(testIds)).slice(0, 50);
    // Find any element with aria-label that contains a digit
    var labels = [];
    document.querySelectorAll('[aria-label]').forEach(function(e) {
      var l = e.getAttribute('aria-label');
      if (l && /\\d/.test(l) && l.length < 300) labels.push(e.tagName + '[' + (e.getAttribute('data-testid') || '') + ']: ' + l);
    });
    return { url: url, articleCount: articles.length, testIds: uniqueTestIds, labels: labels.slice(0, 40) };
  })()
`) as any
console.log('URL:', labels.url)
console.log('articles:', labels.articleCount)
console.log('testIds:', labels.testIds.slice(0, 30).join(', '))
console.log('labels with digits:')
for (const l of labels.labels) console.log(' ', l)
await browser.close()
process.exit(0)
