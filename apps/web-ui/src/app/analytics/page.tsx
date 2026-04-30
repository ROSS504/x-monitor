import { db } from '@/lib/server'

export const dynamic = 'force-dynamic'

interface DayBucket {
  d: string
  posts: number
  likes: number
  retweets: number
  replies: number
  views: number
}

interface TopRow {
  tweet_id: string
  author_handle: string
  text: string
  posted_at: number
  likes: number
  retweets: number
  replies: number
  views: number
}

const DEFAULT_HINT = 'scrape-user:@FinTax_Intern'

function fmtZH(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}

export default function AnalyticsPage({ searchParams }: { searchParams: { hint?: string } }) {
  const hint = (searchParams.hint?.trim()) || DEFAULT_HINT

  const hints = db.prepare(`
    SELECT scenario_hint AS hint, COUNT(*) AS c FROM posts
    WHERE scenario_hint IS NOT NULL GROUP BY scenario_hint ORDER BY c DESC LIMIT 30
  `).all() as Array<{ hint: string; c: number }>

  const totals = db.prepare(`
    SELECT
      COUNT(*) AS posts,
      COALESCE(SUM(l.likes), 0) AS likes,
      COALESCE(SUM(l.retweets), 0) AS retweets,
      COALESCE(SUM(l.replies), 0) AS replies,
      COALESCE(SUM(l.views), 0) AS views
    FROM posts p
    LEFT JOIN (SELECT post_id, likes, retweets, replies, views, ROW_NUMBER() OVER (PARTITION BY post_id ORDER BY scraped_at DESC) rn FROM post_engagement) l ON l.post_id = p.id AND l.rn = 1
    WHERE p.scenario_hint = ?
  `).get(hint) as { posts: number; likes: number; retweets: number; replies: number; views: number }

  const days = db.prepare(`
    WITH latest AS (
      SELECT post_id, likes, retweets, replies, views,
        ROW_NUMBER() OVER (PARTITION BY post_id ORDER BY scraped_at DESC) rn
      FROM post_engagement
    )
    SELECT
      date(p.posted_at/1000, 'unixepoch', 'localtime') AS d,
      COUNT(*) AS posts,
      COALESCE(SUM(l.likes), 0) AS likes,
      COALESCE(SUM(l.retweets), 0) AS retweets,
      COALESCE(SUM(l.replies), 0) AS replies,
      COALESCE(SUM(l.views), 0) AS views
    FROM posts p
    LEFT JOIN latest l ON l.post_id = p.id AND l.rn = 1
    WHERE p.scenario_hint = ?
    GROUP BY d ORDER BY d ASC
  `).all(hint) as DayBucket[]

  const topByViews = db.prepare(`
    WITH latest AS (
      SELECT post_id, likes, retweets, replies, views,
        ROW_NUMBER() OVER (PARTITION BY post_id ORDER BY scraped_at DESC) rn
      FROM post_engagement
    )
    SELECT p.tweet_id, p.author_handle, p.text, p.posted_at,
      COALESCE(l.likes, 0) AS likes,
      COALESCE(l.retweets, 0) AS retweets,
      COALESCE(l.replies, 0) AS replies,
      COALESCE(l.views, 0) AS views
    FROM posts p
    LEFT JOIN latest l ON l.post_id = p.id AND l.rn = 1
    WHERE p.scenario_hint = ?
    ORDER BY views DESC LIMIT 10
  `).all(hint) as TopRow[]

  const avgViews = totals.posts > 0 ? Math.round(totals.views / totals.posts) : 0

  return (
    <main>
      <h1>数据可视化</h1>

      <form method="get" style={{ marginBottom: 24 }}>
        <label style={{ marginRight: 8 }}>来源：</label>
        <select name="hint" defaultValue={hint} style={{ padding: 6 }}>
          {hints.map(h => (
            <option key={h.hint} value={h.hint}>{h.hint}（{h.c} 条）</option>
          ))}
        </select>
        <button type="submit" style={{ padding: '6px 16px', marginLeft: 8 }}>切换</button>
      </form>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
        <Stat label="总帖数" value={totals.posts} />
        <Stat label="总浏览" value={totals.views.toLocaleString()} highlight />
        <Stat label="总点赞" value={totals.likes} />
        <Stat label="总转发" value={totals.retweets} />
        <Stat label="总回复" value={totals.replies} />
        <Stat label="平均浏览/帖" value={avgViews} muted />
      </div>

      <h2>每日浏览量 + 帖数</h2>
      <DailyBarChart days={days} />

      <h2 style={{ marginTop: 32 }}>Top 10 浏览推文</h2>
      <TopBarChart rows={topByViews} />
    </main>
  )
}

function Stat({ label, value, highlight, muted }: { label: string; value: number | string; highlight?: boolean; muted?: boolean }) {
  return (
    <div
      style={{
        padding: 12,
        border: highlight ? '2px solid #06b' : '1px solid #ddd',
        borderRadius: 4,
        minWidth: 140,
        background: muted ? '#fafafa' : 'white',
      }}
    >
      <div style={{ fontSize: 11, color: '#666' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: highlight ? '#06b' : '#222' }}>{value}</div>
    </div>
  )
}

function DailyBarChart({ days }: { days: DayBucket[] }) {
  if (days.length === 0) return <p style={{ color: '#888' }}>暂无数据。</p>
  const W = 920
  const H = 240
  const PAD = { top: 20, right: 60, bottom: 40, left: 50 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const maxViews = Math.max(...days.map(d => d.views), 1)
  const maxPosts = Math.max(...days.map(d => d.posts), 1)
  const barW = innerW / days.length

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ border: '1px solid #eee', borderRadius: 4, background: 'white' }}>
      {/* Y-axis grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <g key={t}>
          <line x1={PAD.left} y1={PAD.top + innerH * (1 - t)} x2={PAD.left + innerW} y2={PAD.top + innerH * (1 - t)}
            stroke="#eee" strokeDasharray={t === 0 ? 'none' : '2,3'} />
          <text x={PAD.left - 6} y={PAD.top + innerH * (1 - t) + 4} fontSize="10" fill="#888" textAnchor="end">
            {Math.round(maxViews * t)}
          </text>
        </g>
      ))}
      {/* Bars + line */}
      {days.map((d, i) => {
        const x = PAD.left + i * barW
        const vh = (d.views / maxViews) * innerH
        const py = PAD.top + innerH - (d.posts / maxPosts) * innerH
        return (
          <g key={d.d}>
            <rect x={x + barW * 0.15} y={PAD.top + innerH - vh}
              width={barW * 0.7} height={vh}
              fill="#06b" opacity={0.7}>
              <title>{`${d.d}: ${d.views} views, ${d.posts} posts`}</title>
            </rect>
            <text x={x + barW / 2} y={PAD.top + innerH - vh - 4}
              fontSize="10" fill="#06b" textAnchor="middle">{d.views}</text>
            <text x={x + barW / 2} y={PAD.top + innerH + 14}
              fontSize="10" fill="#444" textAnchor="middle">{d.d.slice(5)}</text>
            <text x={x + barW / 2} y={PAD.top + innerH + 28}
              fontSize="9" fill="#888" textAnchor="middle">{d.posts} 帖</text>
            {/* posts as right-axis line dot */}
            <circle cx={x + barW / 2} cy={py} r="3" fill="#c33" />
            {i > 0 && (() => {
              const prev = days[i - 1]
              const prevX = PAD.left + (i - 1) * barW + barW / 2
              const prevY = PAD.top + innerH - (prev.posts / maxPosts) * innerH
              return <line x1={prevX} y1={prevY} x2={x + barW / 2} y2={py} stroke="#c33" strokeWidth="1.5" />
            })()}
          </g>
        )
      })}
      {/* Right axis label */}
      <text x={W - PAD.right + 8} y={PAD.top + 4} fontSize="10" fill="#c33">帖数（红线）</text>
      <text x={PAD.left} y={PAD.top - 6} fontSize="10" fill="#06b">浏览量（蓝柱）</text>
    </svg>
  )
}

function TopBarChart({ rows }: { rows: TopRow[] }) {
  if (rows.length === 0) return <p style={{ color: '#888' }}>暂无数据。</p>
  const W = 920
  const ROW_H = 32
  const PAD = { left: 380, right: 80, top: 8, bottom: 8 }
  const H = ROW_H * rows.length + PAD.top + PAD.bottom
  const innerW = W - PAD.left - PAD.right
  const max = Math.max(...rows.map(r => r.views), 1)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ border: '1px solid #eee', borderRadius: 4, background: 'white' }}>
      {rows.map((r, i) => {
        const y = PAD.top + i * ROW_H
        const w = (r.views / max) * innerW
        const text = r.text.replace(/\n/g, ' ')
        const preview = text.length > 50 ? text.slice(0, 48) + '…' : text
        const url = `https://x.com/${r.author_handle}/status/${r.tweet_id}`
        return (
          <g key={r.tweet_id}>
            <a href={url} target="_blank" rel="noreferrer">
              <text x={PAD.left - 8} y={y + ROW_H * 0.6} fontSize="11" fill="#222" textAnchor="end">
                {preview}
                <title>{text}</title>
              </text>
            </a>
            <rect x={PAD.left} y={y + 6} width={w} height={ROW_H - 14}
              fill="#06b" opacity={0.7}>
              <title>{`${r.views} views, ${r.likes} likes, ${r.retweets} RT, ${r.replies} replies`}</title>
            </rect>
            <text x={PAD.left + w + 4} y={y + ROW_H * 0.62}
              fontSize="11" fill="#06b">
              {r.views} 浏览
              {r.likes > 0 && <tspan fill="#c33"> · {r.likes} ♡</tspan>}
              {r.retweets > 0 && <tspan fill="#0a7"> · {r.retweets} RT</tspan>}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
