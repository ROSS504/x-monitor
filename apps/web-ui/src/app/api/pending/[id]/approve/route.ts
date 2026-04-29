import { NextResponse } from 'next/server'
import { db } from '@/lib/server'
import { draftsRepo, auditRepo } from '@x-monitor/db'

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  if (Number.isNaN(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  draftsRepo(db).updateStatus(id, 'approved')
  auditRepo(db).log({ actor: 'user', action: 'approve', targetType: 'draft', targetId: id })
  return NextResponse.json({ ok: true })
}
