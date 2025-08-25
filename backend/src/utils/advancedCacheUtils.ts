import { createClient, RedisClientType } from 'redis';
import { performanceMonitor } from './performanceMonitor.js';

/**
 * 고급 Redis 캐시 유틸리티
 * - 계층적 캐싱
 - TTL 최적화
 * - 캐시 워밍
 * - 캐시 무효화 전략
 */
export class AdvancedCacheUtils {
  private client: RedisClientType;
  private readonly DEFAULT_TTL = 3600; // 1시간
  private readonly CACHE_PREFIX = 'woodie:';
  
  // 캐시 계층 정의
  private readonly CACHE_LAYERS = {
    L1: { ttl: 300, prefix: 'l1:' },      // 5분 - 자주 액세스되는 데이터
    L2: { ttl: 1800, prefix: 'l2:' },     // 30분 - 중간 빈도 데이터
    L3: { ttl: 7200, prefix: 'l3:' },     // 2시간 - 덜 자주 변경되는 데이터
    L4: { ttl: 86400, prefix: 'l4:' }     // 24시간 - 거의 변경되지 않는 데이터
  };

  constructor(client: RedisClientType) {
    this.client = client;
  }

  /**
   * 계층적 캐시 저장
   */
  async setLayered<T>(
    key: string, 
    value: T, 
    layer: keyof typeof this.CACHE_LAYERS = 'L2'
  ): Promise<boolean> {
    return performanceMonitor.measureExecutionTime(
      'cache-set-layered',
      async () => {
        const layerConfig = this.CACHE_LAYERS[layer];
        const fullKey = `${this.CACHE_PREFIX}${layerConfig.prefix}${key}`;
        
        try {
          const serializedValue = JSON.stringify(value);
          await this.client.setEx(fullKey, layerConfig.ttl, serializedValue);
          return true;
        } catch (error) {
          console.error(`Failed to set layered cache for key: ${fullKey}`, error);
          return false;
        }
      }
    ).then(result => result.result);
  }

  /**
   * 계층적 캐시 조회
   */
  async getLayered<T>(
    key: string, 
    layers: Array<keyof typeof this.CACHE_LAYERS> = ['L1', 'L2', 'L3', 'L4']
  ): Promise<T | null> {
    return performanceMonitor.measureExecutionTime(
      'cache-get-layered',
      async () => {
        // 낮은 계층부터 순차 검색
        for (const layer of layers) {
          const layerConfig = this.CACHE_LAYERS[layer];
          const fullKey = `${this.CACHE_PREFIX}${layerConfig.prefix}${key}`;
          
          try {
            const value = await this.client.get(fullKey);
            if (value !== null) {
              const parsedValue = JSON.parse(value);
              
              // 상위 계층에 복사 (Cache Promotion)
              if (layer !== 'L1') {
                await this.setLayered(key, parsedValue, 'L1');
              }
              
              return parsedValue;
            }
          } catch (error) {
            console.error(`Failed to get layered cache for key: ${fullKey}`, error);
            continue;
          }
        }
        
        return null;
      }
    ).then(result => result.result);
  }

  /**
   * 스마트 캐시 무효화 (태그 기반)
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    return performanceMonitor.measureExecutionTime(
      'cache-invalidate-by-tags',
      async () => {
        let deletedCount = 0;
        
        for (const tag of tags) {
          const pattern = `${this.CACHE_PREFIX}*:tag:${tag}:*`;
          
          try {
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
              const deleted = await this.client.del(keys);
              deletedCount += deleted;
            }
          } catch (error) {
            console.error(`Failed to invalidate cache by tag: ${tag}`, error);
          }
        }
        
        return deletedCount;
      }
    ).then(result => result.result);
  }

  /**
   * 태그가 있는 캐시 저장
   */
  async setWithTags<T>(
    key: string,
    value: T,
    ttl: number,
    tags: string[] = []
  ): Promise<boolean> {
    return performanceMonitor.measureExecutionTime(
      'cache-set-with-tags',
      async () => {
        const taggedKey = tags.length > 0 
          ? `${this.CACHE_PREFIX}${tags.map(t => `tag:${t}`).join(':')}:${key}`
          : `${this.CACHE_PREFIX}${key}`;
        
        try {
          const serializedValue = JSON.stringify(value);
          await this.client.setEx(taggedKey, ttl, serializedValue);
          
          // 태그 인덱스 생성
          for (const tag of tags) {
            const tagIndexKey = `${this.CACHE_PREFIX}tag_index:${tag}`;
            await this.client.sAdd(tagIndexKey, taggedKey);
            await this.client.expire(tagIndexKey, ttl + 3600); // 태그 인덱스는 조금 더 오래 보관
          }
          
          return true;
        } catch (error) {
          console.error(`Failed to set cache with tags for key: ${key}`, error);
          return false;
        }
      }
    ).then(result => result.result);
  }

  /**
   * 캐시 워밍 (미리 데이터 로드)
   */
  async warmCache(
    warmingJobs: Array<{
      key: string;
      dataProvider: () => Promise<any>;
      layer?: 'L1' | 'L2' | 'L3' | 'L4';
      tags?: string[];
    }>
  ): Promise<{ success: number; failed: number }> {
    return performanceMonitor.measureExecutionTime(
      'cache-warming',
      async () => {
        let success = 0;
        let failed = 0;
        
        const promises = warmingJobs.map(async (job) => {
          try {
            const data = await job.dataProvider();
            
            if (job.tags && job.tags.length > 0) {
              const ttl = job.layer && job.layer in this.CACHE_LAYERS ? 
                this.CACHE_LAYERS[job.layer as keyof typeof this.CACHE_LAYERS].ttl : 
                this.DEFAULT_TTL;
              await this.setWithTags(job.key, data, ttl, job.tags);
            } else {
              await this.setLayered(job.key, data, (job.layer as keyof typeof this.CACHE_LAYERS) || 'L2');
            }
            
            success++;
          } catch (error) {
            console.error(`Cache warming failed for key: ${job.key}`, error);
            failed++;
          }
        });
        
        await Promise.all(promises);
        
        return { success, failed };
      }
    ).then(result => result.result);
  }

  /**
   * 배치 캐시 조회
   */
  async getBatch<T>(keys: string[]): Promise<Map<string, T | null>> {
    return performanceMonitor.measureExecutionTime(
      'cache-get-batch',
      async () => {
        const result = new Map<string, T | null>();
        
        if (keys.length === 0) return result;
        
        try {
          const fullKeys = keys.map(key => `${this.CACHE_PREFIX}${key}`);
          const values = await this.client.mGet(fullKeys);
          
          for (let i = 0; i < keys.length; i++) {
            const value = values[i];
            if (value !== null) {
              try {
                result.set(keys[i], JSON.parse(value));
              } catch (parseError) {
                console.error(`Failed to parse cached value for key: ${keys[i]}`, parseError);
                result.set(keys[i], null);
              }
            } else {
              result.set(keys[i], null);
            }
          }
        } catch (error) {
          console.error('Batch cache get failed', error);
          // 오류 발생 시 모든 키에 대해 null 반환
          keys.forEach(key => result.set(key, null));
        }
        
        return result;
      }
    ).then(result => result.result);
  }

  /**
   * 배치 캐시 저장
   */
  async setBatch<T>(
    items: Array<{ key: string; value: T; ttl?: number }>
  ): Promise<{ success: number; failed: number }> {
    return performanceMonitor.measureExecutionTime(
      'cache-set-batch',
      async () => {
        let success = 0;
        let failed = 0;
        
        const promises = items.map(async (item) => {
          try {
            const fullKey = `${this.CACHE_PREFIX}${item.key}`;
            const serializedValue = JSON.stringify(item.value);
            const ttl = item.ttl || this.DEFAULT_TTL;
            
            await this.client.setEx(fullKey, ttl, serializedValue);
            success++;
          } catch (error) {
            console.error(`Failed to set cache for key: ${item.key}`, error);
            failed++;
          }
        });
        
        await Promise.all(promises);
        
        return { success, failed };
      }
    ).then(result => result.result);
  }

  /**
   * LRU 기반 캐시 정리
   */
  async cleanupLRU(maxMemoryUsage: number = 1024 * 1024 * 100): Promise<number> { // 100MB
    return performanceMonitor.measureExecutionTime(
      'cache-cleanup-lru',
      async () => {
        try {
          const info = await this.client.info('memory');
          const usedMemory = parseInt(info.match(/used_memory:(\d+)/)?.[1] || '0');
          
          if (usedMemory > maxMemoryUsage) {
            // Redis LRU 설정 확인 및 조정
            await this.client.configSet('maxmemory', maxMemoryUsage.toString());
            await this.client.configSet('maxmemory-policy', 'allkeys-lru');
            
            // 수동으로 일부 키 정리 (L4 계층부터)
            const l4Keys = await this.client.keys(`${this.CACHE_PREFIX}${this.CACHE_LAYERS.L4.prefix}*`);
            const keysToDelete = l4Keys.slice(0, Math.min(1000, l4Keys.length / 2));
            
            let deletedCount = 0;
            if (keysToDelete.length > 0) {
              deletedCount = await this.client.del(keysToDelete);
            }
            
            return deletedCount;
          }
          
          return 0;
        } catch (error) {
          console.error('LRU cleanup failed', error);
          return 0;
        }
      }
    ).then(result => result.result);
  }

  /**
   * 캐시 통계 조회
   */
  async getStats(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    hitRatio: string;
    layerDistribution: Record<string, number>;
  }> {
    return performanceMonitor.measureExecutionTime(
      'cache-get-stats',
      async () => {
        try {
          const info = await this.client.info();
          const keyspaceInfo = info.split('\r\n').find(line => line.startsWith('db0:'));
          const memoryInfo = info.split('\r\n').find(line => line.startsWith('used_memory_human:'));
          
          const totalKeys = keyspaceInfo ? 
            parseInt(keyspaceInfo.match(/keys=(\d+)/)?.[1] || '0') : 0;
          
          const memoryUsage = memoryInfo ? 
            memoryInfo.split(':')[1] : 'Unknown';
          
          // 계층별 키 분포 조회
          const layerDistribution: Record<string, number> = {};
          for (const layer of Object.keys(this.CACHE_LAYERS) as Array<keyof typeof this.CACHE_LAYERS>) {
            const config = this.CACHE_LAYERS[layer];
            const pattern = `${this.CACHE_PREFIX}${config.prefix}*`;
            const keys = await this.client.keys(pattern);
            layerDistribution[layer] = keys.length;
          }
          
          // Hit ratio 계산 (간단한 근사치)
          const hitRatio = 'N/A'; // Redis INFO에서 실제 hit ratio를 계산하거나 별도 카운터 필요
          
          return {
            totalKeys,
            memoryUsage,
            hitRatio,
            layerDistribution
          };
        } catch (error) {
          console.error('Failed to get cache stats', error);
          return {
            totalKeys: 0,
            memoryUsage: 'Unknown',
            hitRatio: 'Unknown',
            layerDistribution: {}
          };
        }
      }
    ).then(result => result.result);
  }

  /**
   * 캐시 키 패턴 분석
   */
  async analyzeKeyPatterns(): Promise<{
    pattern: string;
    count: number;
    estimatedMemory: string;
  }[]> {
    return performanceMonitor.measureExecutionTime(
      'cache-analyze-key-patterns',
      async () => {
        try {
          const allKeys = await this.client.keys(`${this.CACHE_PREFIX}*`);
          const patternCounts = new Map<string, number>();
          
          // 키 패턴 분석
          for (const key of allKeys) {
            const parts = key.split(':');
            if (parts.length >= 2) {
              const pattern = parts.slice(0, 3).join(':') + ':*'; // 처음 3레벨까지
              patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
            }
          }
          
          // 상위 패턴 반환
          const sortedPatterns = Array.from(patternCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([pattern, count]) => ({
              pattern,
              count,
              estimatedMemory: `${Math.round(count * 1024 / 1024)}MB` // 대략적 추정
            }));
          
          return sortedPatterns;
        } catch (error) {
          console.error('Failed to analyze key patterns', error);
          return [];
        }
      }
    ).then(result => result.result);
  }
}

// 싱글톤 인스턴스 생성용 팩토리
export function createAdvancedCacheUtils(redisClient: RedisClientType): AdvancedCacheUtils {
  return new AdvancedCacheUtils(redisClient);
}

export default AdvancedCacheUtils;