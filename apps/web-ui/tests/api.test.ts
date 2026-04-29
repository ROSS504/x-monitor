import { describe, it, expect } from 'vitest'
import { statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const ROUTES = [
  'src/app/api/pending/route.ts',
  'src/app/api/pending/[id]/approve/route.ts',
  'src/app/api/pending/[id]/reject/route.ts',
  'src/app/api/status/route.ts',
  'src/app/api/test/inject-post/route.ts',
  'src/app/api/playbooks/route.ts',
  'src/app/api/playbooks/[id]/toggle/route.ts',
  'src/app/api/playbooks/[id]/delete/route.ts',
]

describe('api routes exist', () => {
  for (const r of ROUTES) {
    it(r, () => {
      expect(statSync(resolve(ROOT, r)).isFile()).toBe(true)
    })
  }
})
