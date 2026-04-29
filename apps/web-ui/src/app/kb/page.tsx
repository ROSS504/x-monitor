import { db } from '@/lib/server'
import { kbDocsRepo } from '@x-monitor/db'

export const dynamic = 'force-dynamic'

export default function KbPage() {
  const docs = kbDocsRepo(db).list()
  return (
    <main>
      <h1>知识库</h1>
      <p style={{ color: '#666', fontSize: 13 }}>
        每小时由 fresh-kb-indexer 从 Dify 拉取一次。
        通过 <code>pnpm kb-publish &lt;name&gt; &lt;file&gt;</code> 推送新文档。
      </p>
      {docs.length === 0 ? (
        <p>暂无文档（确认已设置 DIFY_API_KEY 和 DIFY_DATASET_ID 并等待第一次同步）。</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 16 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <th align="left">文档</th>
              <th align="left">字数</th>
              <th align="left">命中数</th>
              <th align="left">状态</th>
              <th align="left">启用</th>
              <th align="left">同步时间</th>
            </tr>
          </thead>
          <tbody>
            {docs.map(d => (
              <tr key={d.id} style={{ borderTop: '1px solid #eee', fontSize: 13 }}>
                <td><strong>{d.name}</strong> <code style={{ fontSize: 11, color: '#888' }}>{d.difyDocId.slice(0, 8)}</code></td>
                <td>{d.wordCount}</td>
                <td>{d.hitCount}</td>
                <td>{d.indexingStatus ?? '-'}</td>
                <td>{d.enabled ? '是' : '否'}</td>
                <td>{new Date(d.lastSyncedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
