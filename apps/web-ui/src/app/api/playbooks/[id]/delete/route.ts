import { NextResponse } from 'next/server'
import { db } from '@/lib/server'
import { playbooksRepo } from '@x-monitor/db'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  if (Number.isNaN(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  playbooksRepo(db).deleteById(id)
  return NextResponse.redirect(new URL('/playbooks', req.url), 303)
}
