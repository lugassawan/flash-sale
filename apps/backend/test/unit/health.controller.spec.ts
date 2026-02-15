import { HealthController } from '../../src/presentation/http/rest/controllers/health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let mockRedis: { ping: jest.Mock };
  let mockDataSource: { query: jest.Mock };
  let mockReply: { status: jest.Mock; send: jest.Mock };

  beforeEach(() => {
    mockRedis = { ping: jest.fn() };
    mockDataSource = { query: jest.fn() };
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
  });

  describe('when all dependencies are healthy', () => {
    beforeEach(() => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);
      controller = new HealthController(mockRedis, mockDataSource);
    });

    it('should return 200 with healthy status', async () => {
      await controller.check(mockReply as any);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      const body = mockReply.send.mock.calls[0][0];
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('healthy');
      expect(body.data.checks.redis.status).toBe('up');
      expect(body.data.checks.postgresql.status).toBe('up');
      expect(typeof body.data.uptime).toBe('number');
    });
  });

  describe('when Redis is down', () => {
    beforeEach(() => {
      mockRedis.ping.mockRejectedValue(new Error('Connection refused'));
      mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);
      controller = new HealthController(mockRedis, mockDataSource);
    });

    it('should return 503 with degraded status', async () => {
      await controller.check(mockReply as any);

      expect(mockReply.status).toHaveBeenCalledWith(503);
      const body = mockReply.send.mock.calls[0][0];
      expect(body.data.status).toBe('degraded');
      expect(body.data.checks.redis.status).toBe('down');
      expect(body.data.checks.postgresql.status).toBe('up');
    });
  });

  describe('when PostgreSQL is down', () => {
    beforeEach(() => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockDataSource.query.mockRejectedValue(new Error('Connection refused'));
      controller = new HealthController(mockRedis, mockDataSource);
    });

    it('should return 503 with degraded status', async () => {
      await controller.check(mockReply as any);

      expect(mockReply.status).toHaveBeenCalledWith(503);
      const body = mockReply.send.mock.calls[0][0];
      expect(body.data.status).toBe('degraded');
      expect(body.data.checks.redis.status).toBe('up');
      expect(body.data.checks.postgresql.status).toBe('down');
    });
  });

  describe('when dependencies are not configured', () => {
    beforeEach(() => {
      controller = new HealthController(undefined, undefined);
    });

    it('should return 200 with not_configured status', async () => {
      await controller.check(mockReply as any);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      const body = mockReply.send.mock.calls[0][0];
      expect(body.data.status).toBe('healthy');
      expect(body.data.checks.redis.status).toBe('not_configured');
      expect(body.data.checks.postgresql.status).toBe('not_configured');
    });
  });

  describe('latency tracking', () => {
    beforeEach(() => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockDataSource.query.mockResolvedValue([]);
      controller = new HealthController(mockRedis, mockDataSource);
    });

    it('should report latencyMs for each dependency', async () => {
      await controller.check(mockReply as any);

      const body = mockReply.send.mock.calls[0][0];
      expect(typeof body.data.checks.redis.latencyMs).toBe('number');
      expect(typeof body.data.checks.postgresql.latencyMs).toBe('number');
    });
  });
});
