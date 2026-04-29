#!/usr/bin/env tsx
// Publish a local text/markdown file to Dify as a new dataset document.
// Usage: pnpm tsx scripts/kb-publish.ts <name> <path-to-text-file>
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createDifyManager } from '@x-monitor/dify-client'
import { getDb, migrate, kbDocsRepo } from '@x-monitor/db'

const [, , name, filePath] = process.argv
if (!name || !filePath) {
  console.error('Usage: pnpm tsx scripts/kb-publish.ts <name> <path-to-text-file>')
  process.exit(1)
}

const apiKey = process.env.DIFY_API_KEY
const datasetId = process.env.DIFY_DATASET_ID
if (!apiKey || !datasetId) {
  console.error('DIFY_API_KEY and DIFY_DATASET_ID must be set')
  process.exit(1)
}

const text = readFileSync(resolve(filePath), 'utf8')
const manager = createDifyManager({ apiKey, datasetId, baseUrl: process.env.DIFY_BASE_URL })

console.log(`Publishing "${name}" (${text.length} chars) to Dify dataset ${datasetId}...`)
const r = await manager.createDocByText({ name, text })
console.log(`Created Dify document id=${r.id} name=${r.name}`)

const db = getDb(); migrate(db)
kbDocsRepo(db).upsert({
  difyDocId: r.id,
  name: r.name,
  wordCount: text.split(/\s+/).length,
  hitCount: 0,
  enabled: true,
  indexingStatus: 'pending',
  dataSourceType: 'text',
  difyCreatedAt: Date.now(),
})
console.log('Cached in local kb_documents table')
process.exit(0)
