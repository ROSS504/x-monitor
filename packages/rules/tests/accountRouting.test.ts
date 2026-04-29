import { describe, it, expect } from 'vitest'
import type { Account } from '@x-monitor/core'
import { pickAccountForStrategy } from '../src/accountRouting.js'

const baseBh = { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' }
const mk = (id: number, handle: string, role: Account['role']): Account => ({
  id, handle, role,
  cookiesPath: '/tmp/c', dailyLimit: 10, minIntervalMin: 30,
  businessHours: baseBh, cooldownUntil: null,
})
const accounts: Account[] = [
  mk(1, 'FinTax_Official', 'official'),
  mk(2, 'RossYu_Personal', 'personal'),
  mk(3, 'RossYu_Founder', 'founder'),
]

describe('pickAccountForStrategy', () => {
  it('article-match → official', () => {
    expect(pickAccountForStrategy('article-match', accounts)?.handle).toBe('FinTax_Official')
  })
  it('kb-synthesis → official', () => {
    expect(pickAccountForStrategy('kb-synthesis', accounts)?.handle).toBe('FinTax_Official')
  })
  it('customer-engagement prefers personal', () => {
    expect(pickAccountForStrategy('customer-engagement', accounts)?.handle).toBe('RossYu_Personal')
  })
  it('customer-engagement falls back to founder when no personal', () => {
    const onlyOfficialAndFounder = accounts.filter(a => a.role !== 'personal')
    expect(pickAccountForStrategy('customer-engagement', onlyOfficialAndFounder)?.handle).toBe('RossYu_Founder')
  })
  it('returns null when no match', () => {
    expect(pickAccountForStrategy('article-match', [accounts[1]])).toBeNull()
  })
})
