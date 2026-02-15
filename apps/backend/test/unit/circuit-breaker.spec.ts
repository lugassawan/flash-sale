import {
  CircuitBreaker,
  CircuitOpenError,
  CircuitState,
} from '../../src/infrastructure/persistence/postgresql/circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker(3, 1000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should start in CLOSED state', () => {
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('should return result and stay CLOSED on successful operation', async () => {
    const result = await breaker.run(() => Promise.resolve('ok'));

    expect(result).toBe('ok');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('should transition from CLOSED to OPEN after reaching failure threshold', async () => {
    const error = new Error('fail');

    for (let i = 0; i < 3; i++) {
      await expect(breaker.run(() => Promise.reject(error))).rejects.toThrow('fail');
    }

    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('should reject with CircuitOpenError when circuit is OPEN', async () => {
    const error = new Error('fail');

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(breaker.run(() => Promise.reject(error))).rejects.toThrow('fail');
    }

    expect(breaker.getState()).toBe(CircuitState.OPEN);

    await expect(breaker.run(() => Promise.resolve('ok'))).rejects.toThrow(CircuitOpenError);
    await expect(breaker.run(() => Promise.resolve('ok'))).rejects.toThrow(
      'Circuit breaker is OPEN',
    );
  });

  it('should transition from OPEN to HALF_OPEN after recovery time elapses', async () => {
    const error = new Error('fail');
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(breaker.run(() => Promise.reject(error))).rejects.toThrow('fail');
    }

    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // Advance time past recovery window
    jest.spyOn(Date, 'now').mockReturnValue(now + 1001);

    const result = await breaker.run(() => Promise.resolve('recovered'));

    expect(result).toBe('recovered');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('should transition from HALF_OPEN to CLOSED on successful operation', async () => {
    const error = new Error('fail');
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(breaker.run(() => Promise.reject(error))).rejects.toThrow('fail');
    }

    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // Advance time past recovery window — next call will enter HALF_OPEN
    jest.spyOn(Date, 'now').mockReturnValue(now + 1001);

    await breaker.run(() => Promise.resolve('ok'));

    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('should transition from HALF_OPEN to OPEN on failure', async () => {
    const error = new Error('fail');
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(breaker.run(() => Promise.reject(error))).rejects.toThrow('fail');
    }

    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // Advance time past recovery window — next call will enter HALF_OPEN
    jest.spyOn(Date, 'now').mockReturnValue(now + 1001);

    // Fail again in HALF_OPEN — should go straight back to OPEN
    await expect(breaker.run(() => Promise.reject(new Error('still broken')))).rejects.toThrow(
      'still broken',
    );

    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('should reset failure count on success', async () => {
    const error = new Error('fail');

    // Accumulate failures just below threshold
    for (let i = 0; i < 2; i++) {
      await expect(breaker.run(() => Promise.reject(error))).rejects.toThrow('fail');
    }

    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    // Success resets the count
    await breaker.run(() => Promise.resolve('ok'));

    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    // Need another full threshold of failures to trip
    for (let i = 0; i < 2; i++) {
      await expect(breaker.run(() => Promise.reject(error))).rejects.toThrow('fail');
    }

    // Still CLOSED because count was reset — only 2 failures, not 3
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });
});
