import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import Redis from 'ioredis';

let redisContainer: StartedRedisContainer;
let redisClient: Redis;

export async function setupRedisContainer(): Promise<{
  container: StartedRedisContainer;
  client: Redis;
}> {
  redisContainer = await new RedisContainer('redis:7-alpine').start();
  redisClient = new Redis({
    host: redisContainer.getHost(),
    port: redisContainer.getMappedPort(6379),
  });
  return { container: redisContainer, client: redisClient };
}

export async function teardownRedisContainer(): Promise<void> {
  if (redisClient) {
    redisClient.disconnect();
  }
  if (redisContainer) {
    await redisContainer.stop();
  }
}
