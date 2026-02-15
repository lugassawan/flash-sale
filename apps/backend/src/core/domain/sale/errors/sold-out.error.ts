import { DomainError } from './domain.error';

export class SoldOutError extends DomainError {
  readonly code = 'SOLD_OUT';
  constructor() {
    super('Sorry, all items have been sold.');
  }
}
