import { describe, it, expect } from 'vitest'
import { createDryRunClient } from '../src/dryRun.js'

describe('DryRunXClient', () => {
  it('records postReply without throwing', async () => {
    const c = createDryRunClient()
    const r = await c.postReply('orig-1', 'hi', 'FinTax_Official')
    expect(r.tweetId).toMatch(/^dry-/)
    expect(c.posted).toHaveLength(1)
    expect(c.posted[0].content).toBe('hi')
  })
  it('returns seeded search results', async () => {
    const c = createDryRunClient([{
      tweetId: '1', authorHandle: 'alice', text: 'about staking',
      postedAt: 1000, lang: 'en',
    }])
    const r = await c.search('staking', 0)
    expect(r).toHaveLength(1)
  })
  it('posted replies are findable via getTweet with default zero metrics', async () => {
    const c = createDryRunClient()
    const r = await c.postReply('orig', 'hello', 'someone')
    const t = await c.getTweet(r.tweetId)
    expect(t).not.toBeNull()
    expect(t?.text).toBe('hello')
    expect(t?.metrics?.likes).toBe(0)
  })
  it('seedDMs + listDMs filters by sinceMs', async () => {
    const c = createDryRunClient()
    c.seedDMs([
      { conversationId: 'c1', messageId: 'm1', senderHandle: 'alice', text: 'hi', sentAt: 1000 },
      { conversationId: 'c1', messageId: 'm2', senderHandle: 'alice', text: 'old', sentAt: 100 },
    ])
    const recent = await c.listDMs(500)
    expect(recent).toHaveLength(1)
    expect(recent[0].messageId).toBe('m1')
  })
})
