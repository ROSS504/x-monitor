import { db } from '@/lib/server'
import { accountsRepo, sentRepo } from '@x-monitor/db'

export const dynamic = 'force-dynamic'

export default function AccountsPage() {
  const accounts = accountsRepo(db).list()
  const now = Date.now()
  return (
    <main>
      <h1>账号</h1>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ddd' }}>
            <th align="left">用户名</th>
            <th align="left">角色</th>
            <th align="left">日上限</th>
            <th align="left">最小间隔</th>
            <th align="left">今日已发</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map(a => {
            const sentToday = sentRepo(db).countTodayForAccount(a.id, now)
            return (
              <tr key={a.id} style={{ borderTop: '1px solid #eee' }}>
                <td>@{a.handle}</td>
                <td>{a.role === 'official' ? '官方' : a.role === 'personal' ? '个人' : '创始人'}</td>
                <td>{a.dailyLimit}</td>
                <td>{a.minIntervalMin} 分钟</td>
                <td>{sentToday} / {a.dailyLimit}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
