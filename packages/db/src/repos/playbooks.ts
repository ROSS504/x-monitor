import type Database from 'better-sqlite3'

export interface ReplyPlaybook {
  id: number
  name: string
  keywords: string[]
  strategyText: string
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface InsertPlaybookInput {
  name: string
  keywords: string[]
  strategyText: string
  enabled?: boolean
}

function rowToPlaybook(r: any): ReplyPlaybook {
  return {
    id: r.id,
    name: r.name,
    keywords: parseKeywords(r.keywords),
    strategyText: r.strategy_text,
    enabled: !!r.enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function parseKeywords(s: string): string[] {
  return s.split(/[\s,]+/).map(k => k.trim().toLowerCase()).filter(Boolean)
}

function serializeKeywords(ks: string[]): string {
  return ks.map(k => k.trim().toLowerCase()).filter(Boolean).join(' ')
}

export function playbooksRepo(db: Database.Database) {
  return {
    insert(p: InsertPlaybookInput): number {
      const now = Date.now()
      const info = db.prepare(`
        INSERT INTO reply_playbooks (name, keywords, strategy_text, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(p.name, serializeKeywords(p.keywords), p.strategyText, p.enabled !== false ? 1 : 0, now, now)
      return Number(info.lastInsertRowid)
    },

    list(): ReplyPlaybook[] {
      const rows = db.prepare(`SELECT * FROM reply_playbooks ORDER BY id`).all() as any[]
      return rows.map(rowToPlaybook)
    },

    listEnabled(): ReplyPlaybook[] {
      const rows = db.prepare(`SELECT * FROM reply_playbooks WHERE enabled = 1 ORDER BY id`).all() as any[]
      return rows.map(rowToPlaybook)
    },

    findById(id: number): ReplyPlaybook | null {
      const r = db.prepare(`SELECT * FROM reply_playbooks WHERE id = ?`).get(id) as any
      if (!r) return null
      return rowToPlaybook(r)
    },

    setEnabled(id: number, enabled: boolean): void {
      db.prepare(`UPDATE reply_playbooks SET enabled = ?, updated_at = ? WHERE id = ?`).run(enabled ? 1 : 0, Date.now(), id)
    },

    deleteById(id: number): void {
      db.prepare(`DELETE FROM reply_playbooks WHERE id = ?`).run(id)
    },
  }
}

/**
 * Score a playbook's relevance to a post by counting keyword overlaps (case-insensitive).
 * Returns the count of unique playbook keywords present in the post text.
 */
export function scorePlaybook(p: ReplyPlaybook, postText: string): number {
  if (!p.enabled) return 0
  const text = postText.toLowerCase()
  return p.keywords.filter(k => k.length > 0 && text.includes(k)).length
}

/**
 * Pick the top-N playbooks (default 3) most relevant to a post text. Returns those with score > 0.
 */
export function pickRelevantPlaybooks(playbooks: ReplyPlaybook[], postText: string, topN = 3): ReplyPlaybook[] {
  const scored = playbooks
    .map(p => ({ p, s: scorePlaybook(p, postText) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, topN)
  return scored.map(x => x.p)
}
