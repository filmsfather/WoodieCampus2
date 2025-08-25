import type { RedisClientType } from 'redis';
import { createClient } from 'redis';
import { logger } from './logger.js';

// Redis client configuration
const redisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '5000'),
    lazyConnect: true,
  },
  retryDelayOnFailover: 100,
  retryDelayOnClusterDown: 300,
  maxRetriesPerRequest: 3,
};

// Create Redis client
export const redis: RedisClientType = createClient(redisConfig);

// Redis event handlers
redis.on('connect', () => {
  logger.info('Redis client connecting...');
});

redis.on('ready', () => {
  logger.info('Redis client connected and ready');
});

redis.on('error', (error) => {
  logger.error('Redis client error:', error);
});

redis.on('end', () => {
  logger.info('Redis client connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Redis client reconnecting...');
});

// Initialize Redis connection
export const connectRedis = async (): Promise<boolean> => {
  try {
    await redis.connect();
    return true;
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    return false;
  }
};

// Redis health check
export const checkRedisConnection = async (): Promise<boolean> => {
  try {
    const pong = await redis.ping();
    logger.info('Redis connection successful:', pong);
    return true;
  } catch (error) {
    logger.error('Redis connection failed:', error);
    return false;
  }
};

// Cache utility functions
export const cacheUtils = {
  // Set with expiration
  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<boolean> {
    try {
      await redis.setEx(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  },

  // Get value
  async get(key: string): Promise<any | null> {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  },

  // Delete key
  async del(key: string): Promise<boolean> {
    try {
      const result = await redis.del(key);
      return result > 0;
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  },

  // Check if key exists
  async exists(key: string): Promise<boolean> {
    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  },

  // Set expiration
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await redis.expire(key, ttlSeconds);
      return result === 1;
    } catch (error) {
      logger.error(`Cache expire error for key ${key}:`, error);
      return false;
    }
  },

  // Get remaining TTL
  async ttl(key: string): Promise<number> {
    try {
      return await redis.ttl(key);
    } catch (error) {
      logger.error(`Cache TTL error for key ${key}:`, error);
      return -1;
    }
  },
};

// Graceful shutdown
export const closeRedisConnection = async (): Promise<void> => {
  try {
    await redis.disconnect();
    logger.info('Redis connection closed');
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
  }
};

export default redis;