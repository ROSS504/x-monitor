#!/usr/bin/env tsx
/**
 * Import CSV leadership list into customer_accounts table.
 * CSV columns: 公司, 姓名, 职位, X账号
 *
 * Usage: pnpm tsx scripts/import-leaders-csv.ts <csv-path>
 */
import { readFileSync } from 'node:fs'
import { getDb, migrate, customersRepo } from '@x-monitor/db'

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('Usage: pnpm tsx scripts/import-leaders-csv.ts <csv-path>')
  process.exit(1)
}

const db = getDb(); migrate(db)

const csv = readFileSync(csvPath, 'utf8')
const rows = csv.split(/\r?\n/).filter(l => l.trim())
let inserted = 0
let existed = 0
for (let i = 1; i < rows.length; i++) {
  const cols = rows[i].split(',')
  const company = (cols[0] ?? '').trim()
  const displayName = (cols[1] ?? '').trim()
  const role = (cols[2] ?? '').trim()
  const cell = (cols[3] ?? '').trim()
  if (!cell || !/[A-Za-z@]/.test(cell)) continue
  const handle = cell.replace(/^@/, '').replace(/[\s]+/g, '')
  if (!handle) continue
  if (customersRepo(db).findByHandle(handle)) { existed++; continue }
  customersRepo(db).insert({
    handle,
    displayName: `${displayName} (${role}@${company})`,
    source: 'crypto-leadership-csv',
    notes: `${company} | ${role}`,
  })
  inserted++
}
console.log(`[import-leaders] inserted=${inserted} existed=${existed} (total in DB now: ${customersRepo(db).list().length})`)
process.exit(0)
