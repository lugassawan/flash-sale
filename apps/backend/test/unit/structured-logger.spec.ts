import { StructuredLogger } from '../../src/infrastructure/logging/structured-logger';
import { correlationStorage } from '../../src/presentation/http/rest/middleware/correlation-id.middleware';

describe('StructuredLogger', () => {
  let logger: StructuredLogger;
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new StructuredLogger();
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  const parseOutput = (): Record<string, unknown> => {
    const raw = writeSpy.mock.calls[0][0] as string;
    return JSON.parse(raw.trim());
  };

  it('should output valid JSON', () => {
    logger.log('test message');
    expect(() => parseOutput()).not.toThrow();
  });

  it('should include timestamp in ISO format', () => {
    logger.log('test message');
    const entry = parseOutput();
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should set level to "info" for log()', () => {
    logger.log('info message');
    const entry = parseOutput();
    expect(entry.level).toBe('info');
  });

  it('should set level to "error" for error()', () => {
    logger.error('error message', 'stack trace');
    const entry = parseOutput();
    expect(entry.level).toBe('error');
    expect(entry.trace).toBe('stack trace');
  });

  it('should set level to "warn" for warn()', () => {
    logger.warn('warn message');
    const entry = parseOutput();
    expect(entry.level).toBe('warn');
  });

  it('should set level to "debug" for debug()', () => {
    logger.debug('debug message');
    const entry = parseOutput();
    expect(entry.level).toBe('debug');
  });

  it('should set level to "verbose" for verbose()', () => {
    logger.verbose('verbose message');
    const entry = parseOutput();
    expect(entry.level).toBe('verbose');
  });

  it('should include context when provided', () => {
    logger.log('test message', 'MyService');
    const entry = parseOutput();
    expect(entry.context).toBe('MyService');
  });

  it('should default context to "Application" when not provided', () => {
    logger.log('test message');
    const entry = parseOutput();
    expect(entry.context).toBe('Application');
  });

  it('should use "no-context" when AsyncLocalStorage has no store', () => {
    logger.log('startup message');
    const entry = parseOutput();
    expect(entry.correlationId).toBe('no-context');
  });

  it('should include correlationId from AsyncLocalStorage when available', () => {
    correlationStorage.run({ correlationId: 'abc-123' }, () => {
      logger.log('request message');
    });
    const entry = parseOutput();
    expect(entry.correlationId).toBe('abc-123');
  });

  it('should include the message', () => {
    logger.log('hello world');
    const entry = parseOutput();
    expect(entry.message).toBe('hello world');
  });

  it('should append newline after JSON', () => {
    logger.log('test');
    const raw = writeSpy.mock.calls[0][0] as string;
    expect(raw.endsWith('\n')).toBe(true);
  });
});
