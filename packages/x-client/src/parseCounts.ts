/**
 * Parse a Twitter-style abbreviated count ("12", "1.2K", "3M", "—") to a number.
 * Returns 0 for empty / dash / unparseable input.
 */
export function parseCount(s: string | null | undefined): number {
  if (!s) return 0
  const cleaned = s.replace(/[, ]/g, '').trim()
  if (!cleaned || cleaned === '-' || cleaned === '—' || cleaned === '0') return 0
  const m = cleaned.match(/^(\d+(?:\.\d+)?)([KkMmBb]?)$/)
  if (!m) return 0
  const v = parseFloat(m[1])
  const unit = m[2].toLowerCase()
  const mult = unit === 'k' ? 1_000 : unit === 'm' ? 1_000_000 : unit === 'b' ? 1_000_000_000 : 1
  return Math.round(v * mult)
}
