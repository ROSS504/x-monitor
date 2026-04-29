import { NextResponse } from 'next/server'
import { db } from '@/lib/server'
import { playbooksRepo } from '@x-monitor/db'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const ct = req.headers.get('content-type') ?? ''
  let name = '', keywords = '', strategyText = ''
  if (ct.includes('application/json')) {
    const body = await req.json() as { name?: string; keywords?: string | string[]; strategyText?: string }
    name = body.name ?? ''
    keywords = Array.isArray(body.keywords) ? body.keywords.join(' ') : (body.keywords ?? '')
    strategyText = body.strategyText ?? ''
  } else {
    const form = await req.formData()
    name = String(form.get('name') ?? '')
    keywords = String(form.get('keywords') ?? '')
    strategyText = String(form.get('strategyText') ?? '')
  }

  if (!name || !keywords || !strategyText) {
    return NextResponse.json({ error: 'name, keywords, strategyText are required' }, { status: 400 })
  }
  const id = playbooksRepo(db).insert({
    name,
    keywords: keywords.split(/[\s,]+/).filter(Boolean),
    strategyText,
  })

  if (ct.includes('application/json')) return NextResponse.json({ id })
  return NextResponse.redirect(new URL('/playbooks', req.url), 303)
}

export async function GET() {
  return NextResponse.json(playbooksRepo(db).list())
}
