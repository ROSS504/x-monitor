import { NextResponse } from 'next/server'
import { db } from '@/lib/server'
import { customersRepo } from '@x-monitor/db'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  if (Number.isNaN(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const customer = customersRepo(db).list().find(c => c.id === id)
  if (!customer) return NextResponse.json({ error: 'not found' }, { status: 404 })
  customersRepo(db).setEnabled(id, !customer.enabled)
  return NextResponse.redirect(new URL('/customers', req.url), 303)
}
