import { Logger } from '@nestjs/common';
import { InfrastructureError } from '@/infrastructure/errors/infrastructure.error';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitOpenError extends InfrastructureError {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

export class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly logger = new Logger(CircuitBreaker.name);

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly recoveryTimeMs: number = 30_000,
  ) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeMs) {
        this.state = CircuitState.HALF_OPEN;
        this.failureCount = 0;
        this.logger.warn('Circuit breaker: HALF_OPEN — testing recovery');
      } else {
        throw new CircuitOpenError('Circuit breaker is OPEN — skipping call');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.logger.log('Circuit breaker: CLOSED — recovery successful');
    }
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.state === CircuitState.HALF_OPEN || this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.logger.error(`Circuit breaker OPEN after ${this.failureCount} failures`);
    }
  }
}
