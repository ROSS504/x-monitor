import { NextResponse } from 'next/server'
import { db } from '@/lib/server'
import { healthRepo } from '@x-monitor/db'
import { aiTasksQ, sendTasksQ, getNetStatus } from '@x-monitor/queue'

export async function GET() {
  const processes = healthRepo(db).all()
  const [aiWaiting, sendWaiting, netStatus] = await Promise.all([
    aiTasksQ.getWaitingCount(),
    sendTasksQ.getWaitingCount(),
    getNetStatus(),
  ])
  return NextResponse.json({ processes, queues: { aiWaiting, sendWaiting }, netStatus })
}
