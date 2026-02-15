import { DomainError } from './domain.error';

export class InvalidTimeRangeError extends DomainError {
  readonly code = 'INVALID_TIME_RANGE';
  constructor(message: string) {
    super(message);
  }
}
