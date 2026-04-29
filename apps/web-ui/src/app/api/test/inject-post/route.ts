import { NextResponse } from 'next/server'
import { db } from '@/lib/server'
import { postsRepo } from '@x-monitor/db'
import { aiTasksQ } from '@x-monitor/queue'
import { newTraceId } from '@x-monitor/core'

export async function POST(req: Request) {
  const body = (await req.json()) as { text: string; authorHandle?: string }
  if (!body.text || typeof body.text !== 'string') {
    return NextResponse.json({ error: 'text required' }, { status: 400 })
  }
  const traceId = newTraceId()
  const id = postsRepo(db).insert({
    tweetId: `manual-${Date.now()}`,
    authorHandle: body.authorHandle ?? 'tester',
    text: body.text,
    postedAt: Date.now(),
    lang: 'en',
    source: 'browser',
    scenarioHint: 'manual-injection',
    status: 'discovered',
    traceId,
  })
  await aiTasksQ.add('analyze', { postId: id, traceId })
  return NextResponse.json({ id, traceId })
}
