import { NextResponse } from 'next/server'
import { db } from '@/lib/server'
import { customersRepo } from '@x-monitor/db'

export async function POST(req: Request) {
  const ct = req.headers.get('content-type') ?? ''
  let handle = '', displayName = '', notes = ''
  if (ct.includes('application/json')) {
    const body = await req.json() as { handle?: string; displayName?: string; notes?: string }
    handle = body.handle ?? ''
    displayName = body.displayName ?? ''
    notes = body.notes ?? ''
  } else {
    const form = await req.formData()
    handle = String(form.get('handle') ?? '').trim().replace(/^@/, '')
    displayName = String(form.get('displayName') ?? '').trim()
    notes = String(form.get('notes') ?? '').trim()
  }
  if (!handle) return NextResponse.json({ error: 'handle required' }, { status: 400 })
  const id = customersRepo(db).insert({
    handle,
    displayName: displayName || null,
    notes: notes || null,
    source: 'manual',
  })
  if (ct.includes('application/json')) return NextResponse.json({ id })
  return NextResponse.redirect(new URL('/customers', req.url), 303)
}

export async function GET() {
  return NextResponse.json(customersRepo(db).list())
}
