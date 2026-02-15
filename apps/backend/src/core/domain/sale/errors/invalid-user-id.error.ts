import { DomainError } from './domain.error';

export class InvalidUserIdError extends DomainError {
  readonly code = 'INVALID_USER_ID';
  constructor(message: string) {
    super(message);
  }
}
