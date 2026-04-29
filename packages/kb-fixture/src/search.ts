import { articles, type Article } from './articles.js'

export interface SearchResult {
  article: Article
  chunks: { id: string; text: string; score: number }[]
  score: number
}

const STOP = new Set(['the', 'a', 'an', 'i', 'have', 'is', 'are', 'of', 'to', 'in', 'on', 'for', 'about', 'my'])

function tokens(s: string): string[] {
  return s.toLowerCase().match(/[a-z]+/g)?.filter(t => !STOP.has(t)) ?? []
}

export function searchKB(query: string): SearchResult[] {
  const qToks = new Set(tokens(query))
  if (qToks.size === 0) return []
  const out: SearchResult[] = []
  for (const a of articles) {
    const chunkScores = a.chunks.map(c => {
      const cToks = tokens(c.text)
      const overlap = cToks.filter(t => qToks.has(t)).length
      return { id: c.id, text: c.text, score: overlap / Math.max(cToks.length, 1) }
    })
    const top = chunkScores.filter(c => c.score > 0)
    if (top.length === 0) continue
    out.push({ article: a, chunks: top, score: Math.max(...top.map(c => c.score)) })
  }
  return out.sort((a, b) => b.score - a.score)
}
