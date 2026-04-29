import { getDb, migrate, accountsRepo } from '@x-monitor/db'

const db = getDb()
migrate(db)

interface SeedAccount {
  handle: string
  role: 'official' | 'personal' | 'founder'
  cookiesEnv: string
  cookiesDefault: string
  dailyLimit: number
  minIntervalMin: number
}

const seeds: SeedAccount[] = [
  {
    handle: 'FinTax_Official',
    role: 'official',
    cookiesEnv: 'COOKIES_FINTAX_OFFICIAL',
    cookiesDefault: '/Users/nightyoung/twitter_cookies_fintax_en.json',
    dailyLimit: 30,
    minIntervalMin: 15,
  },
  {
    handle: 'RossYu_Personal',
    role: 'personal',
    cookiesEnv: 'COOKIES_ROSSYU_PERSONAL',
    cookiesDefault: '/Users/nightyoung/twitter_cookies.json',
    dailyLimit: 20,
    minIntervalMin: 30,
  },
  {
    handle: 'RossYu_Founder',
    role: 'founder',
    cookiesEnv: 'COOKIES_ROSSYU_FOUNDER',
    cookiesDefault: '/Users/nightyoung/twitter_cookies_fintax_cn.json',
    dailyLimit: 15,
    minIntervalMin: 60,
  },
]

const businessHours = { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' }

let created = 0
let existed = 0
for (const s of seeds) {
  if (accountsRepo(db).findByHandle(s.handle)) {
    existed++
    continue
  }
  accountsRepo(db).insert({
    handle: s.handle,
    role: s.role,
    cookiesPath: process.env[s.cookiesEnv] ?? s.cookiesDefault,
    dailyLimit: s.dailyLimit,
    minIntervalMin: s.minIntervalMin,
    businessHours,
    cooldownUntil: null,
  })
  created++
}

console.log(`Seeded ${created} new accounts (${existed} already existed)`)
