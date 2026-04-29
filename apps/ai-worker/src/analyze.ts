import {
  buildAnalyzePostPrompt,
  parseAnalyzePostResponse,
  ANALYZE_POST_PROMPT_VERSION,
  type AnalyzePostResult,
} from '@x-monitor/prompts'
import type { runPrompt as RunPrompt } from '@x-monitor/claude-client'

export interface AnalyzeDeps { runPrompt: typeof RunPrompt }

export async function analyzeOne(
  post: { text: string; authorHandle: string },
  deps: AnalyzeDeps,
): Promise<AnalyzePostResult & { promptVersion: string }> {
  const prompt = buildAnalyzePostPrompt(post)
  const r = await deps.runPrompt({ prompt, timeoutMs: 60_000 })
  return { ...parseAnalyzePostResponse(r.text), promptVersion: ANALYZE_POST_PROMPT_VERSION }
}
