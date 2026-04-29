import type { ReactNode } from 'react'

export const metadata = { title: 'X 监控面板' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          maxWidth: 960,
          margin: '20px auto',
          padding: '0 12px',
        }}
      >
        <nav
          style={{
            display: 'flex',
            gap: 16,
            marginBottom: 24,
            paddingBottom: 12,
            borderBottom: '1px solid #ddd',
          }}
        >
          <a href="/">概览</a>
          <a href="/pending">待审核</a>
          <a href="/accounts">账号</a>
          <a href="/sent">已发送</a>
          <a href="/dms">私信</a>
          <a href="/customers">潜客</a>
          <a href="/playbooks">策略</a>
          <a href="/kb">知识库</a>
          <a href="/audit">日志</a>
          <a href="/status">系统状态</a>
        </nav>
        {children}
      </body>
    </html>
  )
}
