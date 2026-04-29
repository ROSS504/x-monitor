export const KB_MATCH_THRESHOLD = 0.15
export function isMatched(score: number): boolean { return score >= KB_MATCH_THRESHOLD }
