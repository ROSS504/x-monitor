import { getDb, migrate, accountsRepo } from '@x-monitor/db'

const db = getDb()
migrate(db)

const existing = accountsRepo(db).findByHandle('FinTax_Official')
if (!existing) {
  accountsRepo(db).insert({
    handle: 'FinTax_Official',
    role: 'official',
    cookiesPath: process.env.COOKIES_FINTAX_OFFICIAL ?? '/Users/nightyoung/twitter_cookies_fintax_en.json',
    dailyLimit: 30,
    minIntervalMin: 15,
    businessHours: { startHour: 9, endHour: 23, tz: 'Asia/Shanghai' },
    cooldownUntil: null,
  })
  console.log('Seeded FinTax_Official')
} else {
  console.log('Account already exists')
}
