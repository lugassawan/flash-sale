import { DomainError } from './domain.error';

export class SaleNotActiveError extends DomainError {
  readonly code = 'SALE_NOT_ACTIVE';
  constructor() {
    super('The sale is not currently active.');
  }
}
