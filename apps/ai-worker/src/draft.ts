import {
  buildDraftFromArticlePrompt,
  parseDraftFromArticleResponse,
  DRAFT_FROM_ARTICLE_PROMPT_VERSION,
} from '@x-monitor/prompts'
import { isMatched } from '@x-monitor/rules'
import type { runPrompt as RunPrompt } from '@x-monitor/claude-client'
import type { SearchKBFn } from '@x-monitor/dify-client'

export interface DraftDeps {
  runPrompt: typeof RunPrompt
  searchKB: SearchKBFn
}
export interface DraftResult {
  draft: { content: string; citations: { chunkId: string; quote: string }[] } | null
  reason: 'matched' | 'no_match'
  matchScore: number
  articleId?: string
  promptVersion: string
}

export async function draftOne(
  post: { text: string; authorHandle: string },
  deps: DraftDeps,
): Promise<DraftResult> {
  const results = await deps.searchKB(post.text)
  if (results.length === 0 || !isMatched(results[0].score)) {
    return {
      draft: null,
      reason: 'no_match',
      matchScore: results[0]?.score ?? 0,
      promptVersion: DRAFT_FROM_ARTICLE_PROMPT_VERSION,
    }
  }
  const top = results[0]
  const prompt = buildDraftFromArticlePrompt({
    post,
    article: { id: top.article.id, title: top.article.title, url: top.article.url },
    chunks: top.chunks,
  })
  const r = await deps.runPrompt({ prompt, timeoutMs: 90_000 })
  const parsed = parseDraftFromArticleResponse(r.text)
  return {
    draft: parsed,
    reason: 'matched',
    matchScore: top.score,
    articleId: top.article.id,
    promptVersion: DRAFT_FROM_ARTICLE_PROMPT_VERSION,
  }
}
