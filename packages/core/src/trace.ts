import { monotonicFactory } from 'ulid'
const ulid = monotonicFactory()
export const newTraceId = (): string => ulid()
