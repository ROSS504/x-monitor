import { db } from '@/lib/server'
import { customersRepo } from '@x-monitor/db'

export const dynamic = 'force-dynamic'

export default function CustomersPage() {
  const customers = customersRepo(db).list()
  return (
    <main>
      <h1>潜在客户名单</h1>
      <p style={{ color: '#666', fontSize: 13 }}>scanner-customer 每 5 分钟扫描这些账号最近 2 天的发帖。</p>
      {customers.length === 0 ? (
        <p>还没有客户。可通过 <code>customersRepo.insert</code> 或后续的导入接口添加。</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 16 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <th align="left">用户名</th>
              <th align="left">昵称</th>
              <th align="left">来源</th>
              <th align="left">启用</th>
              <th align="left">备注</th>
            </tr>
          </thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.id} style={{ borderTop: '1px solid #eee' }}>
                <td>@{c.handle}</td>
                <td>{c.displayName ?? '-'}</td>
                <td>{c.source}</td>
                <td>{c.enabled ? '是' : '否'}</td>
                <td style={{ color: '#666', fontSize: 12 }}>{c.notes ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
