/**
 * Parse a timestamp value from Redis, which may be stored as epoch milliseconds
 * (e.g., "1750057200000") or as an ISO 8601 string.
 */
export function parseRedisTimestamp(value: string): Date {
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && asNumber > 0) {
    return new Date(asNumber);
  }
  return new Date(value);
}
