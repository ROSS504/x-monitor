export interface AnalyzePostInput { text: string; authorHandle: string }
export interface AnalyzePostResult {
  type: 'question' | 'opinion' | 'discussion' | 'news' | 'personal' | 'other'
  scenario: '1' | '2' | '3' | 'skip'
  viewpoint: string
}

export const PROMPT_VERSION = 'analyze-post@v1'

export function buildAnalyzePostPrompt(p: AnalyzePostInput): string {
  return `You are an analyst classifying X (Twitter) posts about cryptocurrency tax.

Post by @${p.authorHandle}:
"""
${p.text}
"""

Tasks:
1. Classify "type": question | opinion | discussion | news | personal | other
2. Identify the core viewpoint in one sentence (English).
3. Decide which scenario applies: "1" if the post raises a concrete tax topic likely to match a tax article; "2" if it's a discussion/opinion needing a synthesized response; "skip" if not actionable.

Output ONLY a JSON object on a single line, no prose:
{"type":"...","scenario":"...","viewpoint":"..."}
`
}

export function parseAnalyzePostResponse(raw: string): AnalyzePostResult {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : raw
  const jsonMatch = candidate.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON in response: ${raw.slice(0, 200)}`)
  return JSON.parse(jsonMatch[0]) as AnalyzePostResult
}
