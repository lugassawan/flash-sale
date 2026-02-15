import { TimeRange } from '../../../src/core/domain/sale/value-objects/time-range.vo';
import { InvalidTimeRangeError } from '../../../src/core/domain/sale/errors/invalid-time-range.error';

describe('TimeRange Value Object', () => {
  const start = new Date('2026-02-15T10:00:00Z');
  const end = new Date('2026-02-15T12:00:00Z');

  it('should create with valid start and end', () => {
    const range = TimeRange.create(start, end);
    expect(range.start).toEqual(start);
    expect(range.end).toEqual(end);
  });

  it('should reject when end equals start', () => {
    expect(() => TimeRange.create(start, start)).toThrow(InvalidTimeRangeError);
    expect(() => TimeRange.create(start, start)).toThrow('End time must be after start time');
  });

  it('should reject when end is before start', () => {
    expect(() => TimeRange.create(end, start)).toThrow(InvalidTimeRangeError);
  });

  describe('isBeforeStart', () => {
    const range = TimeRange.create(start, end);

    it('should return true when now is before start', () => {
      const before = new Date('2026-02-15T09:59:59Z');
      expect(range.isBeforeStart(before)).toBe(true);
    });

    it('should return false when now equals start', () => {
      expect(range.isBeforeStart(start)).toBe(false);
    });

    it('should return false when now is after start', () => {
      const after = new Date('2026-02-15T10:00:01Z');
      expect(range.isBeforeStart(after)).toBe(false);
    });
  });

  describe('isWithinRange', () => {
    const range = TimeRange.create(start, end);

    it('should return true when now equals start', () => {
      expect(range.isWithinRange(start)).toBe(true);
    });

    it('should return true when now is between start and end', () => {
      const mid = new Date('2026-02-15T11:00:00Z');
      expect(range.isWithinRange(mid)).toBe(true);
    });

    it('should return false when now equals end (exclusive)', () => {
      expect(range.isWithinRange(end)).toBe(false);
    });

    it('should return false when now is before start', () => {
      const before = new Date('2026-02-15T09:00:00Z');
      expect(range.isWithinRange(before)).toBe(false);
    });
  });

  describe('isPastEnd', () => {
    const range = TimeRange.create(start, end);

    it('should return true when now equals end', () => {
      expect(range.isPastEnd(end)).toBe(true);
    });

    it('should return true when now is after end', () => {
      const after = new Date('2026-02-15T13:00:00Z');
      expect(range.isPastEnd(after)).toBe(true);
    });

    it('should return false when now is before end', () => {
      const before = new Date('2026-02-15T11:59:59Z');
      expect(range.isPastEnd(before)).toBe(false);
    });
  });
});
