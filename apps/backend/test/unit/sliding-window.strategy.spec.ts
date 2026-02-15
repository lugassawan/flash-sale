import { SlidingWindowStrategy } from '../../src/infrastructure/rate-limiting/sliding-window.strategy';

describe('SlidingWindowStrategy', () => {
  let strategy: SlidingWindowStrategy;
  let mockRedis: {
    pipeline: jest.Mock;
  };
  let mockPipeline: {
    zremrangebyscore: jest.Mock;
    zadd: jest.Mock;
    zcard: jest.Mock;
    expire: jest.Mock;
    exec: jest.Mock;
  };

  beforeEach(() => {
    mockPipeline = {
      zremrangebyscore: jest.fn().mockReturnThis(),
      zadd: jest.fn().mockReturnThis(),
      zcard: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    };

    mockRedis = {
      pipeline: jest.fn().mockReturnValue(mockPipeline),
    };

    strategy = new SlidingWindowStrategy(mockRedis as any);
  });

  describe('isAllowed', () => {
    it('should allow the first request (count = 1)', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 0], // zremrangebyscore result
        [null, 1], // zadd result
        [null, 1], // zcard result — 1 entry in window
        [null, 1], // expire result
      ]);

      const result = await strategy.isAllowed('user-1');
      expect(result).toBe(true);
    });

    it('should reject when count exceeds maxRequests', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 2], // 2 entries — exceeds limit of 1
        [null, 1],
      ]);

      const result = await strategy.isAllowed('user-1');
      expect(result).toBe(false);
    });

    it('should use correct Redis key format', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 1],
        [null, 1],
      ]);

      await strategy.isAllowed('alice@test.com');

      expect(mockPipeline.zremrangebyscore).toHaveBeenCalledWith(
        'rate:window:alice@test.com',
        0,
        expect.any(Number),
      );
    });

    it('should set TTL on the window key', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 1],
        [null, 1],
      ]);

      await strategy.isAllowed('user-1');

      expect(mockPipeline.expire).toHaveBeenCalledWith('rate:window:user-1', 1);
    });

    it('should remove entries outside the window', async () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      mockPipeline.exec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 1],
        [null, 1],
      ]);

      await strategy.isAllowed('user-1');

      expect(mockPipeline.zremrangebyscore).toHaveBeenCalledWith(
        'rate:window:user-1',
        0,
        now - 1_000,
      );

      jest.restoreAllMocks();
    });
  });

  describe('getRetryAfter', () => {
    it('should return window duration in seconds', async () => {
      const retryAfter = await strategy.getRetryAfter('user-1');
      expect(retryAfter).toBe(1);
    });
  });
});
