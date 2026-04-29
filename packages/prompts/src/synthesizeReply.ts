export interface SynthesizeReplyInput {
  post: { text: string; authorHandle: string; viewpoint: string }
  chunks: { id: string; text: string; articleTitle: string; articleUrl: string }[]
  playbooks?: { name: string; strategyText: string }[]
}

export interface SynthesizeReplyResult {
  content: string
  citations: { chunkId: string; quote: string }[]
}

export const PROMPT_VERSION = 'synthesize-reply@v1'

export function buildSynthesizeReplyPrompt(p: SynthesizeReplyInput): string {
  const chunkBlock = p.chunks.map(c => `[${c.id}] (from "${c.articleTitle}" — ${c.articleUrl})\n${c.text}`).join('\n\n')
  const playbookBlock = (p.playbooks ?? []).length > 0
    ? `\n\nOperator playbook hints (apply tone/angle if relevant; cite passages, not playbooks):\n${(p.playbooks ?? []).map(pb => `- ${pb.name}: ${pb.strategyText}`).join('\n')}`
    : ''
  return `You are a content operator at FinTax (crypto tax SaaS).

The following X post is a discussion or opinion — there's no single article that directly answers it, but multiple knowledge-base passages give relevant context.

Original post by @${p.post.authorHandle}:
"""
${p.post.text}
"""

Identified core viewpoint: ${p.post.viewpoint}

Relevant knowledge-base passages (each tagged with chunk_id):
${chunkBlock}${playbookBlock}

Write a single English X reply that:
- Engages with the post's specific point (not generic platitudes)
- Synthesizes ONLY from the passages above (no invented facts)
- Includes ONE article URL inline (pick the most relevant passage's source)
- Stays under 280 characters total
- Has a discussion tone, not promotional

Output ONLY a JSON object:
{"content":"<reply text>","citations":[{"chunkId":"<id>","quote":"<words from that chunk you used>"}, ...]}
`
}

export function parseSynthesizeReplyResponse(raw: string): SynthesizeReplyResult {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : raw
  const jsonMatch = candidate.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON in response: ${raw.slice(0, 200)}`)
  return JSON.parse(jsonMatch[0]) as SynthesizeReplyResult
}
