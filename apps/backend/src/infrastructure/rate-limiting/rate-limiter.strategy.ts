export const RATE_LIMITER_STRATEGY = Symbol('RATE_LIMITER_STRATEGY');

export interface RateLimiterStrategy {
  /** Returns true if the request is allowed */
  isAllowed(key: string): Promise<boolean>;
  /** Seconds until the caller should retry */
  getRetryAfter(key: string): Promise<number>;
}
