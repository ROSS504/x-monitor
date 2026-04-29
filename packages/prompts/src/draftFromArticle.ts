export interface DraftFromArticleInput {
  post: { text: string; authorHandle: string }
  article: { id: string; title: string; url: string }
  chunks: { id: string; text: string }[]
}
export interface DraftFromArticleResult {
  content: string
  citations: { chunkId: string; quote: string }[]
}
export const PROMPT_VERSION = 'draft-from-article@v1'

export function buildDraftFromArticlePrompt(p: DraftFromArticleInput): string {
  const chunkBlock = p.chunks.map(c => `[${c.id}] ${c.text}`).join('\n')
  return `You are a content operator at FinTax (crypto tax SaaS).

Original post by @${p.post.authorHandle}:
"""
${p.post.text}
"""

Reference article: "${p.article.title}" — ${p.article.url}
Available passages from this article (each tagged with chunk_id):
${chunkBlock}

Write a single English X reply that:
- Naturally engages with the original post
- Draws ONLY from the passages above (no invented facts)
- Includes the article URL inline
- Stays under 280 characters total
- Does not sound promotional

Output ONLY a JSON object:
{"content":"<the reply text>","citations":[{"chunkId":"<id>","quote":"<words from that chunk you used>"}, ...]}
`
}

export function parseDraftFromArticleResponse(raw: string): DraftFromArticleResult {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : raw
  const jsonMatch = candidate.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON in response: ${raw.slice(0, 200)}`)
  return JSON.parse(jsonMatch[0]) as DraftFromArticleResult
}
