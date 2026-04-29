export interface BusinessHours {
  startHour: number  // 0-23
  endHour: number    // 0-23 (exclusive end)
  tz: string         // IANA tz, e.g. 'Asia/Shanghai'
}

export function withinBusinessHours(d: Date, bh: BusinessHours): boolean {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: bh.tz,
    hour: '2-digit',
    hour12: false,
  })
  const hourStr = fmt.format(d)
  const hour = parseInt(hourStr === '24' ? '00' : hourStr, 10)
  return hour >= bh.startHour && hour < bh.endHour
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000)
}
