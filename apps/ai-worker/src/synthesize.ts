import { searchKB } from '@x-monitor/kb-fixture'
import {
  buildSynthesizeReplyPrompt,
  parseSynthesizeReplyResponse,
  SYNTHESIZE_REPLY_PROMPT_VERSION,
} from '@x-monitor/prompts'
import { isMatched } from '@x-monitor/rules'
import type { runPrompt as RunPrompt } from '@x-monitor/claude-client'

export interface SynthesizeDeps { runPrompt: typeof RunPrompt }
export interface SynthesizeResult {
  draft: { content: string; citations: { chunkId: string; quote: string }[] } | null
  reason: 'synthesized' | 'no_kb_match'
  totalScore: number
  promptVersion: string
}

export async function synthesizeOne(
  post: { text: string; authorHandle: string; viewpoint: string },
  deps: SynthesizeDeps,
): Promise<SynthesizeResult> {
  const results = searchKB(post.text)
  if (results.length === 0 || !isMatched(results[0].score)) {
    return {
      draft: null,
      reason: 'no_kb_match',
      totalScore: results[0]?.score ?? 0,
      promptVersion: SYNTHESIZE_REPLY_PROMPT_VERSION,
    }
  }

  const top = results.slice(0, 3)
  const chunks = top.flatMap(r =>
    r.chunks.map(c => ({
      id: c.id,
      text: c.text,
      articleTitle: r.article.title,
      articleUrl: r.article.url,
    }))
  )
  const totalScore = top.reduce((s, r) => s + r.score, 0)

  const prompt = buildSynthesizeReplyPrompt({ post, chunks })
  const r = await deps.runPrompt({ prompt, timeoutMs: 90_000 })
  const parsed = parseSynthesizeReplyResponse(r.text)
  return {
    draft: parsed,
    reason: 'synthesized',
    totalScore,
    promptVersion: SYNTHESIZE_REPLY_PROMPT_VERSION,
  }
}
