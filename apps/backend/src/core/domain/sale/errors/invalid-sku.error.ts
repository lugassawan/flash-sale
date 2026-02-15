import { DomainError } from './domain.error';

export class InvalidSKUError extends DomainError {
  readonly code = 'INVALID_SKU';
  constructor(value: string) {
    super(`Invalid SKU: "${value}". Must be 1-64 alphanumeric characters or hyphens.`);
  }
}
