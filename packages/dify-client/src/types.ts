export interface KBChunk {
  id: string
  text: string
}

export interface KBArticle {
  id: string
  title: string
  url: string
  lang: string
  chunks: KBChunk[]
}

export interface KBSearchResult {
  article: KBArticle
  chunks: { id: string; text: string; score: number }[]
  score: number
}

/** A pluggable KB search function. kb-fixture and dify-client both implement this shape. */
export type SearchKBFn = (query: string) => Promise<KBSearchResult[]> | KBSearchResult[]
