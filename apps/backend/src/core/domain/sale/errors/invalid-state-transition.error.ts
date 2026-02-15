import { DomainError } from './domain.error';
import { SaleState } from '../value-objects/sale-state.vo';

export class InvalidStateTransitionError extends DomainError {
  readonly code = 'INVALID_STATE_TRANSITION';
  constructor(from: SaleState, to: SaleState) {
    super(`Cannot transition from ${from} to ${to}.`);
  }
}
