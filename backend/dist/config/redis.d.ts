import { RedisClientType } from 'redis';
export declare const redis: RedisClientType;
export declare const connectRedis: () => Promise<boolean>;
export declare const checkRedisConnection: () => Promise<boolean>;
export declare const cacheUtils: {
    set(key: string, value: any, ttlSeconds?: number): Promise<boolean>;
    get(key: string): Promise<any | null>;
    del(key: string): Promise<boolean>;
    exists(key: string): Promise<boolean>;
    expire(key: string, ttlSeconds: number): Promise<boolean>;
    ttl(key: string): Promise<number>;
};
export declare const closeRedisConnection: () => Promise<void>;
export default redis;
