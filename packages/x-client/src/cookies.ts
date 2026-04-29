import { readFileSync } from 'node:fs'

export interface CookieEntry { name: string; value: string; domain?: string; path?: string }

export function loadCookies(path: string): CookieEntry[] {
  const raw = readFileSync(path, 'utf8')
  return JSON.parse(raw) as CookieEntry[]
}
