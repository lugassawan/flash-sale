import { Logger } from '@nestjs/common';
import { LoggingEventPublisher } from '../../src/infrastructure/messaging/logging-event-publisher.adapter';

class TestDomainEvent {
  readonly occurredOn = new Date('2026-02-15T10:00:00Z');
}

describe('LoggingEventPublisher', () => {
  let publisher: LoggingEventPublisher;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    publisher = new LoggingEventPublisher();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('should log event name and timestamp', async () => {
    const event = new TestDomainEvent();

    await publisher.publish(event);

    expect(logSpy).toHaveBeenCalledWith(
      'Domain event: TestDomainEvent at 2026-02-15T10:00:00.000Z',
    );
  });

  it('should not throw', async () => {
    const event = new TestDomainEvent();

    await expect(publisher.publish(event)).resolves.not.toThrow();
  });
});
