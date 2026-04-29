import { Queue } from 'bullmq'
import { connection } from './connection.js'

export interface AiTaskPayload { postId: number; traceId: string }
export interface SendTaskPayload { draftId: number; traceId: string }
export interface AnalyticsTaskPayload {
  sentId: number
  tweetId: string
  bucket: '1h' | '6h' | '24h' | '72h' | '7d'
  traceId: string
}

export const aiTasksQ = new Queue<AiTaskPayload>('ai-tasks', { connection })
export const sendTasksQ = new Queue<SendTaskPayload>('send-tasks', { connection })
export const analyticsTasksQ = new Queue<AnalyticsTaskPayload>('analytics-tasks', { connection })
