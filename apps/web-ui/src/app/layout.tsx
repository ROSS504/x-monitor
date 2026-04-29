import type { ReactNode } from 'react'

export const metadata = { title: 'X Monitor' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
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
          <a href="/">Overview</a>
          <a href="/pending">Pending</a>
          <a href="/status">Status</a>
        </nav>
        {children}
      </body>
    </html>
  )
}
