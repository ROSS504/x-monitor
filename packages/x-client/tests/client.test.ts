import { describe, it, expect } from 'vitest'
import type { XClient, XSearchResult } from '../src/client.js'
import { createDryRunClient } from '../src/dryRun.js'

describe('XClient interface', () => {
  it('DryRunXClient satisfies XClient', () => {
    const c: XClient = createDryRunClient()
    expect(typeof c.search).toBe('function')
    expect(typeof c.postReply).toBe('function')
    expect(typeof c.getTweet).toBe('function')
  })
  it('XSearchResult shape compiles', () => {
    const r: XSearchResult = {
      tweetId: '1', authorHandle: 'a', text: 't', postedAt: 0, lang: 'en'
    }
    expect(r.tweetId).toBe('1')
  })
})
