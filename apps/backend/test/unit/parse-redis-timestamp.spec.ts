import { parseRedisTimestamp } from '../../src/shared/parse-redis-timestamp';

describe('parseRedisTimestamp', () => {
  it('should parse epoch milliseconds string to correct Date', () => {
    const result = parseRedisTimestamp('1750057200000');

    expect(result).toEqual(new Date(1750057200000));
  });

  it('should parse ISO 8601 string', () => {
    const result = parseRedisTimestamp('2025-06-16T07:00:00.000Z');

    expect(result).toEqual(new Date('2025-06-16T07:00:00.000Z'));
  });

  it('should fall through to new Date(value) for "0" since asNumber is not > 0', () => {
    const result = parseRedisTimestamp('0');

    expect(result).toEqual(new Date('0'));
  });

  it('should fall through to new Date(value) for negative number string', () => {
    const result = parseRedisTimestamp('-1000');

    expect(result).toEqual(new Date('-1000'));
  });

  it('should handle non-numeric string', () => {
    const result = parseRedisTimestamp('not-a-number');

    expect(result.toString()).toBe('Invalid Date');
  });
});
