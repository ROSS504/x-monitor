import { db } from '@/lib/server'
import { draftsRepo, postsRepo } from '@x-monitor/db'

export const dynamic = 'force-dynamic'

export default function DraftDetailPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  const draft = draftsRepo(db).findById(id)
  if (!draft)
    return (
      <main>
        <h1>未找到</h1>
      </main>
    )
  const post = postsRepo(db).findById(draft.postId)
  return (
    <main>
      <h1>草稿 #{draft.id}</h1>
      <h2>原帖</h2>
      <div
        style={{
          padding: 12,
          background: '#f5f5f5',
          borderRadius: 4,
          marginBottom: 16,
        }}
      >
        <div style={{ color: '#666', fontSize: 12 }}>
          @{post?.authorHandle} - {post?.tweetId}
        </div>
        <div style={{ marginTop: 4 }}>{post?.text}</div>
      </div>
      <h2>回复内容</h2>
      <div
        style={{
          padding: 12,
          border: '1px solid #ddd',
          borderRadius: 4,
          marginBottom: 16,
        }}
      >
        {draft.content}
      </div>
      <h2>出处</h2>
      <ul>
        {draft.citations.map((c, i) => (
          <li key={i}>
            <strong>{c.chunkId}</strong>: &quot;{c.quote}&quot;
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
        <form action={`/api/pending/${draft.id}/approve`} method="post">
          <button
            type="submit"
            style={{
              padding: '10px 24px',
              background: '#0a7',
              color: 'white',
              border: 'none',
              borderRadius: 4,
            }}
          >
            通过
          </button>
        </form>
        <form action={`/api/pending/${draft.id}/reject`} method="post">
          <button
            type="submit"
            style={{
              padding: '10px 24px',
              background: '#c33',
              color: 'white',
              border: 'none',
              borderRadius: 4,
            }}
          >
            驳回
          </button>
        </form>
      </div>
    </main>
  )
}
