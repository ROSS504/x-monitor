export interface DifyManagerOptions {
  apiKey: string
  datasetId: string
  baseUrl?: string
  fetchImpl?: typeof fetch
}

export interface DifyDocument {
  id: string
  name: string
  position: number
  dataSourceType: string
  indexingStatus: string
  enabled: boolean
  wordCount: number
  hitCount: number
  createdAt: number
}

interface RawCreateDocResponse {
  document: { id: string; name: string }
  batch?: string
}

interface RawListDocsResponse {
  data: Array<{
    id: string
    name: string
    position: number
    data_source_type: string
    indexing_status: string
    enabled: boolean
    word_count: number
    hit_count: number
    created_at: number | string
  }>
  has_more: boolean
  limit: number
  total: number
  page: number
}

export interface DifyManager {
  createDocByText(input: { name: string; text: string; indexingTechnique?: 'high_quality' | 'economy' }): Promise<{ id: string; name: string }>
  listDocuments(opts?: { page?: number; limit?: number; keyword?: string }): Promise<{ docs: DifyDocument[]; total: number; hasMore: boolean }>
}

export function createDifyManager(opts: DifyManagerOptions): DifyManager {
  const baseUrl = opts.baseUrl ?? 'https://api.dify.ai/v1'
  const f = opts.fetchImpl ?? fetch

  async function call(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await f(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opts.apiKey}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      throw new Error(`Dify ${method} ${path} failed: ${res.status} ${await res.text().catch(() => '')}`)
    }
    return res.json()
  }

  return {
    async createDocByText(input) {
      const data = (await call('POST', `/datasets/${opts.datasetId}/document/create-by-text`, {
        name: input.name,
        text: input.text,
        indexing_technique: input.indexingTechnique ?? 'high_quality',
        process_rule: { mode: 'automatic' },
      })) as RawCreateDocResponse
      return { id: data.document.id, name: data.document.name }
    },

    async listDocuments(opts2 = {}) {
      const params = new URLSearchParams()
      if (opts2.page) params.set('page', String(opts2.page))
      if (opts2.limit) params.set('limit', String(opts2.limit))
      if (opts2.keyword) params.set('keyword', opts2.keyword)
      const qs = params.toString() ? `?${params}` : ''
      const data = (await call('GET', `/datasets/${opts.datasetId}/documents${qs}`)) as RawListDocsResponse
      const docs: DifyDocument[] = data.data.map(d => ({
        id: d.id,
        name: d.name,
        position: d.position,
        dataSourceType: d.data_source_type,
        indexingStatus: d.indexing_status,
        enabled: d.enabled,
        wordCount: d.word_count,
        hitCount: d.hit_count,
        createdAt: typeof d.created_at === 'string' ? Date.parse(d.created_at) || Date.now() : d.created_at,
      }))
      return { docs, total: data.total ?? docs.length, hasMore: data.has_more ?? false }
    },
  }
}
