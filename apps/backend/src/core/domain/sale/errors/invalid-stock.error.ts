import { DomainError } from './domain.error';

export class InvalidStockError extends DomainError {
  readonly code = 'INVALID_STOCK';
  constructor(quantity: number) {
    super(`Invalid stock quantity: ${quantity}. Must be a non-negative integer.`);
  }
}
