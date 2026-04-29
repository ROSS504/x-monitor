export interface Article {
  id: string
  title: string
  url: string
  lang: string
  chunks: { id: string; text: string }[]
}

export const articles: Article[] = [
  {
    id: 'art-staking',
    title: 'How Crypto Staking Rewards Are Taxed',
    url: 'https://fintax.tech/staking-tax',
    lang: 'en',
    chunks: [
      { id: 'staking-1', text: 'Staking rewards are taxed at fair market value at the moment of receipt under IRS guidance.' },
      { id: 'staking-2', text: 'Subsequent disposal of staked tokens triggers a separate capital gains event.' },
    ],
  },
  {
    id: 'art-defi',
    title: 'DeFi Tax Reporting Guide',
    url: 'https://fintax.tech/defi-tax',
    lang: 'en',
    chunks: [
      { id: 'defi-1', text: 'DeFi liquidity provision has ambiguous tax treatment depending on jurisdiction.' },
      { id: 'defi-2', text: 'Most jurisdictions require reporting of yield farming income at fair market value.' },
    ],
  },
]
