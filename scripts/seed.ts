import { getDb, migrate, accountsRepo, customersRepo, playbooksRepo, postsRepo } from '@x-monitor/db'
import { newTraceId } from '@x-monitor/core'

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

// --- Demo customers ---
const demoCustomers = [
  { handle: 'crypto_curious_alice', displayName: 'Alice (DeFi PM)', notes: '关注 LP 收益税务的产品经理' },
  { handle: 'jeff_taxlawyer',       displayName: 'Jeff (Tax Lawyer)', notes: '美国加密税务律师，活跃讨论' },
  { handle: 'staking_steward',      displayName: 'Steward', notes: 'Staking 服务商；常发监管动态' },
]
let custCreated = 0
for (const c of demoCustomers) {
  if (customersRepo(db).findByHandle(c.handle)) continue
  customersRepo(db).insert({ handle: c.handle, displayName: c.displayName, notes: c.notes, source: 'demo' })
  custCreated++
}
if (custCreated > 0) console.log(`Seeded ${custCreated} demo customers`)

// --- Demo playbooks ---
const demoPlaybooks = [
  {
    name: '税季截止压力',
    keywords: ['tax', 'deadline', 'IRS', 'filing', 'april'],
    strategyText: '强调申报截止日临近会带来不必要的滞纳与审计风险，建议尽早咨询专业服务。',
  },
  {
    name: 'Staking 时机困惑',
    keywords: ['staking', 'rewards', 'fmv', 'receipt'],
    strategyText: 'IRS 新指引下，Staking 奖励应按到账时的公允市场价计入收入，举具体例子帮助理解。',
  },
  {
    name: 'DeFi 跨司法辖区',
    keywords: ['defi', 'jurisdiction', 'liquidity', 'pool'],
    strategyText: 'DeFi 税务取决于地区——给出 2-3 个主要辖区的快速对照，避免一刀切建议。',
  },
  {
    name: '空投纳税',
    keywords: ['airdrop', 'token', 'received', 'free'],
    strategyText: '空投按收到时市价计入普通收入；后续处置另算资本利得。建议保留区块链时间戳证据。',
  },
]
let pbCreated = 0
for (const p of demoPlaybooks) {
  const existing = playbooksRepo(db).list().find(x => x.name === p.name)
  if (existing) continue
  playbooksRepo(db).insert(p)
  pbCreated++
}
if (pbCreated > 0) console.log(`Seeded ${pbCreated} demo playbooks`)

// --- Demo posts (3 sample tweets seeded as 'discovered'; ai-worker will pick them up) ---
const demoPosts = [
  { tweetId: 'demo-1', authorHandle: 'crypto_curious_alice', text: 'Provided liquidity in DeFi pool for first time. How does this get taxed in the US vs EU?', scenarioHint: 'demo:scenario-2' },
  { tweetId: 'demo-2', authorHandle: 'jeff_taxlawyer', text: 'How are crypto staking rewards taxed under IRS guidance?', scenarioHint: 'demo:scenario-1' },
  { tweetId: 'demo-3', authorHandle: 'staking_steward', text: 'Tax filing deadline is sneaking up. Are you ready for your staking and DeFi reporting?', scenarioHint: 'demo:scenario-2' },
]
let postsCreated = 0
for (const p of demoPosts) {
  const exists = db.prepare(`SELECT id FROM posts WHERE tweet_id = ?`).get(p.tweetId) as { id: number } | undefined
  if (exists) continue
  postsRepo(db).insert({
    tweetId: p.tweetId,
    authorHandle: p.authorHandle,
    text: p.text,
    postedAt: Date.now(),
    lang: 'en',
    source: 'browser',
    scenarioHint: p.scenarioHint,
    status: 'discovered',
    traceId: newTraceId(),
  })
  postsCreated++
}
if (postsCreated > 0) console.log(`Seeded ${postsCreated} demo posts`)
