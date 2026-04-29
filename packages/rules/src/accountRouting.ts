import type { Account } from '@x-monitor/core'

export type DraftStrategy = 'article-match' | 'kb-synthesis' | 'customer-engagement'

/**
 * Pick the account that should send a draft of this strategy.
 * Returns null if no eligible account exists.
 *
 * Strategy → role mapping:
 *  - 'article-match'      → official
 *  - 'kb-synthesis'       → official
 *  - 'customer-engagement'→ personal (founder as fallback)
 */
export function pickAccountForStrategy(
  strategy: DraftStrategy,
  accounts: Account[],
): Account | null {
  const byRole = (role: Account['role']) => accounts.find(a => a.role === role) ?? null

  if (strategy === 'article-match' || strategy === 'kb-synthesis') {
    return byRole('official')
  }
  if (strategy === 'customer-engagement') {
    return byRole('personal') ?? byRole('founder')
  }
  return null
}
