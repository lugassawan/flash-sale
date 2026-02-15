import { DomainError } from './domain.error';

export class AlreadyPurchasedError extends DomainError {
  readonly code = 'ALREADY_PURCHASED';
  constructor() {
    super('You have already purchased this item.');
  }
}
