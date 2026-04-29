import type { KBSearchResult, SearchKBFn } from './types.js'

export interface DifyClientOptions {
  apiKey: string
  datasetId: string
  baseUrl?: string
  topK?: number
  fetchImpl?: typeof fetch
}

interface DifyRetrievalResponse {
  query: { content: string }
  records: Array<{
    segment: {
      id: string
      content: string
      document: {
        id: string
        name: string
      }
    }
    score: number
  }>
}

/**
 * Build a SearchKBFn that hits Dify's /datasets/{id}/retrieve endpoint.
 * https://docs.dify.ai/api-reference/dataset/retrieve-chunks
 *
 * Dify returns flat chunks. We group them by document_id, then for each document
 * pick the top-scoring chunk's score as the article-level score.
 */
export function createDifyClient(opts: DifyClientOptions): SearchKBFn {
  const baseUrl = opts.baseUrl ?? 'https://api.dify.ai/v1'
  const topK = opts.topK ?? 5
  const f = opts.fetchImpl ?? fetch

  return async function searchKB(query: string): Promise<KBSearchResult[]> {
    const res = await f(`${baseUrl}/datasets/${opts.datasetId}/retrieve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        query,
        retrieval_model: {
          search_method: 'hybrid_search',
          reranking_enable: true,
          top_k: topK,
        },
      }),
    })
    if (!res.ok) {
      throw new Error(`Dify retrieve failed: ${res.status} ${await res.text().catch(() => '')}`)
    }
    const data = (await res.json()) as DifyRetrievalResponse

    // Group records by document id
    const byDoc = new Map<string, { docName: string; chunks: { id: string; text: string; score: number }[] }>()
    for (const rec of data.records) {
      const docId = rec.segment.document.id
      const docName = rec.segment.document.name
      const existing = byDoc.get(docId) ?? { docName, chunks: [] }
      existing.chunks.push({ id: rec.segment.id, text: rec.segment.content, score: rec.score })
      byDoc.set(docId, existing)
    }

    const out: KBSearchResult[] = []
    for (const [docId, info] of byDoc) {
      out.push({
        article: {
          id: docId,
          title: info.docName,
          url: deriveUrl(docId, info.docName),
          lang: 'en',
          chunks: info.chunks.map(c => ({ id: c.id, text: c.text })),
        },
        chunks: info.chunks,
        score: Math.max(...info.chunks.map(c => c.score)),
      })
    }
    return out.sort((a, b) => b.score - a.score)
  }
}

/**
 * Dify documents don't carry a public URL by default. Dify document name often is the
 * source URL (when imported from web) or a filename. If it parses as URL, use it;
 * otherwise build a placeholder. Override via Dify document metadata in production.
 */
function deriveUrl(docId: string, docName: string): string {
  if (/^https?:\/\//i.test(docName)) return docName
  return `https://fintax.tech/kb/${docId}`
}
