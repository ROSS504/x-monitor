import { NextResponse } from 'next/server'
import { db } from '@/lib/server'
import { customersRepo } from '@x-monitor/db'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  if (Number.isNaN(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  customersRepo(db).deleteById(id)
  return NextResponse.redirect(new URL('/customers', req.url), 303)
}
