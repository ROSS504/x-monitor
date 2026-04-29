import { analyticsTasksQ, type AnalyticsTaskPayload } from './queues.js'

export const ANALYTICS_BUCKETS: { bucket: AnalyticsTaskPayload['bucket']; delayMs: number }[] = [
  { bucket: '1h',  delayMs: 1 * 3600_000 },
  { bucket: '6h',  delayMs: 6 * 3600_000 },
  { bucket: '24h', delayMs: 24 * 3600_000 },
  { bucket: '72h', delayMs: 72 * 3600_000 },
  { bucket: '7d',  delayMs: 7 * 24 * 3600_000 },
]

export async function scheduleAllBuckets(payload: { sentId: number; tweetId: string; traceId: string }): Promise<void> {
  for (const b of ANALYTICS_BUCKETS) {
    await analyticsTasksQ.add('snapshot', { ...payload, bucket: b.bucket }, { delay: b.delayMs })
  }
}
