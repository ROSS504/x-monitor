import { db } from '@/lib/server'
import { playbooksRepo } from '@x-monitor/db'

export const dynamic = 'force-dynamic'

export default function PlaybooksPage() {
  const all = playbooksRepo(db).list()
  return (
    <main>
      <h1>回复策略 Playbook</h1>
      <p style={{ color: '#666', fontSize: 13 }}>
        在场景 2（讨论/观点）和场景 3（客户互动）时，AI 会根据帖子文本匹配最多 3 条已启用的策略并附进 prompt 中。
      </p>

      <h2 style={{ marginTop: 24 }}>新增策略</h2>
      <form action="/api/playbooks" method="post" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 600 }}>
        <input name="name" placeholder="策略名称" required style={{ padding: 6 }} />
        <input name="keywords" placeholder="关键词（空格或逗号分隔，如：tax IRS deadline）" required style={{ padding: 6 }} />
        <textarea name="strategyText" placeholder="策略说明（如：强调税季截止压力，建议尽早咨询）" rows={3} required style={{ padding: 6 }} />
        <button type="submit" style={{ padding: '8px 16px', alignSelf: 'flex-start' }}>添加</button>
      </form>

      <h2 style={{ marginTop: 24 }}>已有策略（{all.length}）</h2>
      {all.length === 0 ? (
        <p>暂无策略。</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <th align="left">名称</th>
              <th align="left">关键词</th>
              <th align="left">策略</th>
              <th align="left">启用</th>
              <th align="left">操作</th>
            </tr>
          </thead>
          <tbody>
            {all.map(p => (
              <tr key={p.id} style={{ borderTop: '1px solid #eee', fontSize: 13 }}>
                <td>{p.name}</td>
                <td><code>{p.keywords.join(' ')}</code></td>
                <td style={{ maxWidth: 360 }}>{p.strategyText}</td>
                <td>{p.enabled ? '是' : '否'}</td>
                <td>
                  <form action={`/api/playbooks/${p.id}/toggle`} method="post" style={{ display: 'inline-block' }}>
                    <button type="submit" style={{ padding: '4px 10px', marginRight: 6 }}>{p.enabled ? '停用' : '启用'}</button>
                  </form>
                  <form action={`/api/playbooks/${p.id}/delete`} method="post" style={{ display: 'inline-block' }}>
                    <button type="submit" style={{ padding: '4px 10px', background: '#c33', color: 'white', border: 'none', borderRadius: 4 }}>删除</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
