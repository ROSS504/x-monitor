import { db } from '@/lib/server'

export const dynamic = 'force-dynamic'

interface PostRow {
  id: number
  tweet_id: string
  author_handle: string
  text: string
  posted_at: number
  lang: string
  source: string
  scenario_hint: string | null
  status: string
  trace_id: string
}

interface EngagementRow {
  post_id: number
  likes: number
  retweets: number
  replies: number
  bookmarks: number
  views: number | null
  scraped_at: number
}

interface SP {
  hint?: string
  search?: string
  sort?: 'views' | 'likes' | 'replies' | 'recent'
  limit?: string
}

const SORT_BY: Record<NonNullable<SP['sort']>, string> = {
  views: 'COALESCE(e.views, 0)',
  likes: 'COALESCE(e.likes, 0)',
  replies: 'COALESCE(e.replies, 0)',
  recent: 'p.posted_at',
}

export default function PostsPage({ searchParams }: { searchParams: SP }) {
  const sort = searchParams.sort && SORT_BY[searchParams.sort] ? searchParams.sort : 'recent'
  const limit = Math.min(parseInt(searchParams.limit ?? '100', 10) || 100, 500)
  const hint = searchParams.hint?.trim() ?? ''
  const search = searchParams.search?.trim() ?? ''

  const where: string[] = []
  const params: any[] = []
  if (hint) { where.push('p.scenario_hint = ?'); params.push(hint) }
  if (search) { where.push('(p.text LIKE ? OR p.author_handle LIKE ?)'); params.push(`%${search}%`, `%${search}%`) }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const sql = `
    SELECT p.*, e.likes, e.retweets, e.replies, e.bookmarks, e.views, e.scraped_at
    FROM posts p
    LEFT JOIN (
      SELECT post_id, likes, retweets, replies, bookmarks, views, scraped_at,
        ROW_NUMBER() OVER (PARTITION BY post_id ORDER BY scraped_at DESC) AS rn
      FROM post_engagement
    ) e ON e.post_id = p.id AND e.rn = 1
    ${whereSql}
    ORDER BY ${SORT_BY[sort]} DESC, p.posted_at DESC
    LIMIT ?
  `
  const rows = db.prepare(sql).all(...params, limit) as Array<PostRow & Partial<EngagementRow>>

  const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM posts p ${whereSql}`).get(...params) as { c: number }
  const hints = db.prepare(`SELECT scenario_hint, COUNT(*) AS c FROM posts WHERE scenario_hint IS NOT NULL GROUP BY scenario_hint ORDER BY c DESC LIMIT 20`).all() as Array<{ scenario_hint: string; c: number }>

  function fmtZH(ts: number) {
    return new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
  }
  function tweetUrl(r: PostRow) {
    return `https://x.com/${r.author_handle}/status/${r.tweet_id}`
  }
  function statusZH(s: string) {
    const map: Record<string, string> = { discovered: '已发现', analyzing: '分析中', matched_article: '已生草稿', no_match: '无匹配', drafting: '生成中', failed: '失败', archived: '归档' }
    return map[s] ?? s
  }

  function makeUrl(p: Partial<SP>) {
    const merged = { ...searchParams, ...p }
    const qp = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) if (v) qp.set(k, String(v))
    return `?${qp.toString()}`
  }

  return (
    <main>
      <h1>帖子库（{totalRow.c} 条匹配，显示前 {Math.min(rows.length, limit)} 条）</h1>

      <form method="get" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input name="search" placeholder="搜索文本/作者" defaultValue={search} style={{ padding: 6, minWidth: 200 }} />
        <select name="hint" defaultValue={hint} style={{ padding: 6 }}>
          <option value="">全部来源</option>
          {hints.map(h => <option key={h.scenario_hint} value={h.scenario_hint}>{h.scenario_hint}（{h.c}）</option>)}
        </select>
        <select name="sort" defaultValue={sort} style={{ padding: 6 }}>
          <option value="recent">按发帖时间</option>
          <option value="views">按浏览数</option>
          <option value="likes">按点赞</option>
          <option value="replies">按回复</option>
        </select>
        <select name="limit" defaultValue={String(limit)} style={{ padding: 6 }}>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="200">200</option>
          <option value="500">500</option>
        </select>
        <button type="submit" style={{ padding: '6px 16px' }}>筛选</button>
        <a href="/posts" style={{ padding: '6px 12px', textDecoration: 'none', color: '#666' }}>清除</a>
      </form>

      {rows.length === 0 ? (
        <p>没有匹配的帖子。</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd', fontSize: 12 }}>
              <th align="left">作者</th>
              <th align="left">时间</th>
              <th align="left">内容</th>
              <th align="left">来源</th>
              <th align="left">状态</th>
              <th align="right">
                <a href={makeUrl({ sort: 'likes' })} style={{ color: sort === 'likes' ? '#000' : '#888', textDecoration: 'none' }}>♡</a>
              </th>
              <th align="right">
                <a href={makeUrl({ sort: 'replies' })} style={{ color: sort === 'replies' ? '#000' : '#888', textDecoration: 'none' }}>↩</a>
              </th>
              <th align="right">RT</th>
              <th align="right">
                <a href={makeUrl({ sort: 'views' })} style={{ color: sort === 'views' ? '#000' : '#888', textDecoration: 'none' }}>👁</a>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #eee', fontSize: 13, verticalAlign: 'top' }}>
                <td style={{ whiteSpace: 'nowrap', padding: '6px 8px 6px 0' }}>
                  <a href={`https://x.com/${r.author_handle}`} target="_blank" rel="noreferrer">@{r.author_handle}</a>
                </td>
                <td style={{ whiteSpace: 'nowrap', padding: '6px 8px 6px 0', color: '#888' }}>{fmtZH(r.posted_at)}</td>
                <td style={{ padding: '6px 8px 6px 0', maxWidth: 480 }}>
                  <a href={tweetUrl(r as PostRow)} target="_blank" rel="noreferrer" style={{ color: '#222', textDecoration: 'none' }}>
                    {r.text.slice(0, 200)}{r.text.length > 200 ? '…' : ''}
                  </a>
                  {r.scenario_hint && <div style={{ color: '#bbb', fontSize: 11, marginTop: 2 }}>{r.scenario_hint}</div>}
                </td>
                <td style={{ whiteSpace: 'nowrap', padding: '6px 8px 6px 0', fontSize: 12, color: '#666' }}>{r.source}</td>
                <td style={{ whiteSpace: 'nowrap', padding: '6px 8px 6px 0', fontSize: 12 }}>{statusZH(r.status)}</td>
                <td align="right" style={{ padding: '6px 8px 6px 0', color: (r.likes ?? 0) > 0 ? '#000' : '#bbb' }}>{r.likes ?? '-'}</td>
                <td align="right" style={{ padding: '6px 8px 6px 0', color: (r.replies ?? 0) > 0 ? '#000' : '#bbb' }}>{r.replies ?? '-'}</td>
                <td align="right" style={{ padding: '6px 8px 6px 0', color: (r.retweets ?? 0) > 0 ? '#000' : '#bbb' }}>{r.retweets ?? '-'}</td>
                <td align="right" style={{ padding: '6px 8px 6px 0', color: (r.views ?? 0) > 0 ? '#000' : '#bbb' }}>{r.views ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
