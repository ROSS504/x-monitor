import { NextResponse } from 'next/server'
import { db } from '@/lib/server'
import { draftsRepo, postsRepo } from '@x-monitor/db'

export async function GET() {
  const drafts = draftsRepo(db).listByStatus('pending')
  const enriched = drafts.map((d) => ({
    ...d,
    post: postsRepo(db).findById(d.postId),
  }))
  return NextResponse.json(enriched)
}
