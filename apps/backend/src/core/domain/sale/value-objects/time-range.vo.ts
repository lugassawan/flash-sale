import { InvalidTimeRangeError } from '../errors/invalid-time-range.error';

export class TimeRange {
  private constructor(
    private readonly _start: Date,
    private readonly _end: Date,
  ) {}

  static create(start: Date, end: Date): TimeRange {
    if (end.getTime() <= start.getTime()) {
      throw new InvalidTimeRangeError('End time must be after start time');
    }
    return new TimeRange(new Date(start.getTime()), new Date(end.getTime()));
  }

  get start(): Date {
    return new Date(this._start.getTime());
  }

  get end(): Date {
    return new Date(this._end.getTime());
  }

  isBeforeStart(now: Date): boolean {
    return now.getTime() < this._start.getTime();
  }

  isWithinRange(now: Date): boolean {
    return now.getTime() >= this._start.getTime() && now.getTime() < this._end.getTime();
  }

  isPastEnd(now: Date): boolean {
    return now.getTime() >= this._end.getTime();
  }
}
