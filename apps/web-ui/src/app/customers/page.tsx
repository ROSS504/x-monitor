import { db } from '@/lib/server'
import { customersRepo } from '@x-monitor/db'

export const dynamic = 'force-dynamic'

export default function CustomersPage() {
  const customers = customersRepo(db).list()
  return (
    <main>
      <h1>潜在客户名单</h1>
      <p style={{ color: '#666', fontSize: 13 }}>
        scanner-customer 每 5 分钟扫描已启用的客户最近 2 天发帖。
      </p>

      <h2 style={{ marginTop: 24 }}>新增客户</h2>
      <form action="/api/customers" method="post" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 600 }}>
        <input name="handle" placeholder="X 用户名（不带 @）" required style={{ padding: 6 }} />
        <input name="displayName" placeholder="昵称（可选）" style={{ padding: 6 }} />
        <textarea name="notes" placeholder="备注（如：加密交易所，500 万粉丝）" rows={2} style={{ padding: 6 }} />
        <button type="submit" style={{ padding: '8px 16px', alignSelf: 'flex-start' }}>添加</button>
      </form>

      <h2 style={{ marginTop: 24 }}>已有客户（{customers.length}）</h2>
      {customers.length === 0 ? (
        <p>暂无客户。</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <th align="left">用户名</th>
              <th align="left">昵称</th>
              <th align="left">来源</th>
              <th align="left">启用</th>
              <th align="left">备注</th>
              <th align="left">操作</th>
            </tr>
          </thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.id} style={{ borderTop: '1px solid #eee', fontSize: 13 }}>
                <td>@{c.handle}</td>
                <td>{c.displayName ?? '-'}</td>
                <td>{c.source}</td>
                <td>{c.enabled ? '是' : '否'}</td>
                <td style={{ color: '#666', fontSize: 12, maxWidth: 240 }}>{c.notes ?? ''}</td>
                <td>
                  <form action={`/api/customers/${c.id}/toggle`} method="post" style={{ display: 'inline-block' }}>
                    <button type="submit" style={{ padding: '4px 10px', marginRight: 6 }}>{c.enabled ? '停用' : '启用'}</button>
                  </form>
                  <form action={`/api/customers/${c.id}/delete`} method="post" style={{ display: 'inline-block' }}>
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
