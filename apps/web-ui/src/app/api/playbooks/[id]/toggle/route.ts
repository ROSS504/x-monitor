import { NextResponse } from 'next/server'
import { db } from '@/lib/server'
import { playbooksRepo } from '@x-monitor/db'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  if (Number.isNaN(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const p = playbooksRepo(db).findById(id)
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 })
  playbooksRepo(db).setEnabled(id, !p.enabled)
  return NextResponse.redirect(new URL('/playbooks', req.url), 303)
}
