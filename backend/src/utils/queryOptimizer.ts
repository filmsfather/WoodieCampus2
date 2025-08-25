import { PrismaClient } from '@prisma/client';
import { performanceMonitor } from './performanceMonitor.js';

/**
 * 데이터베이스 쿼리 최적화 유틸리티
 */
export class QueryOptimizer {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * 최적화된 망각곡선 분석 쿼리
   */
  async getOptimizedForgettingCurveData(userId: string, days: number): Promise<any[]> {
    return performanceMonitor.measureExecutionTime(
      'optimized-forgetting-curve-query',
      async () => {
        // 원본 쿼리 대신 최적화된 버전 사용
        return this.prisma.$queryRaw`
          SELECT 
            r.id,
            r.user_id,
            r.problem_id,
            r.is_success,
            r.response_time,
            r.current_level,
            r.date,
            p.category_id,
            p.difficulty
          FROM review r
          INNER JOIN problem p ON r.problem_id = p.id
          WHERE r.user_id = ${userId}
            AND r.date >= NOW() - INTERVAL '${days} days'
          ORDER BY r.date DESC
          LIMIT 10000;
        ` as unknown as any[];
      }
    ).then(result => result.result);
  }

  /**
   * 배치로 사용자 통계 조회 (N+1 문제 해결)
   */
  async getBatchUserStats(userIds: string[]): Promise<Map<string, any>> {
    const { result } = await performanceMonitor.measureExecutionTime(
      'batch-user-stats-query',
      async () => {
        const stats = await this.prisma.$queryRaw`
          SELECT 
            r.user_id,
            COUNT(*) as total_reviews,
            AVG(CASE WHEN r.is_success THEN 1 ELSE 0 END) * 100 as success_rate,
            AVG(r.response_time) as avg_response_time,
            COUNT(DISTINCT DATE(r.date)) as active_days
          FROM review r
          WHERE r.user_id = ANY(${userIds})
            AND r.date >= NOW() - INTERVAL '30 days'
          GROUP BY r.user_id;
        `;
        return stats;
      }
    );

    // Map으로 변환하여 빠른 조회 가능
    const statsMap = new Map();
    (result as any[]).forEach((stat: any) => {
      statsMap.set(stat.user_id, stat);
    });

    return statsMap;
  }

  /**
   * 메모리 효율적인 대용량 데이터 스트림 처리
   */
  async *streamUserReviews(userId: string, batchSize: number = 1000): AsyncGenerator<any[], void, unknown> {
    let offset = 0;
    
    while (true) {
      const { result: batch } = await performanceMonitor.measureExecutionTime(
        'stream-user-reviews-batch',
        async () => {
          return this.prisma.$queryRaw`
            SELECT *
            FROM review
            WHERE user_id = ${userId}
            ORDER BY date DESC
            LIMIT ${batchSize}
            OFFSET ${offset};
          `;
        }
      );

      if ((batch as any[]).length === 0) {
        break;
      }

      yield batch as any[];
      offset += batchSize;
    }
  }

  /**
   * 인덱스 사용률 분석
   */
  async analyzeIndexUsage(): Promise<{
    indexName: string;
    tableName: string;
    indexScans: number;
    indexTuplesRead: number;
    indexTuplesFetched: number;
  }[]> {
    return performanceMonitor.measureExecutionTime(
      'analyze-index-usage',
      async () => {
        // PostgreSQL 인덱스 사용률 분석
        return this.prisma.$queryRaw`
          SELECT 
            schemaname,
            tablename,
            indexname,
            idx_scan as index_scans,
            idx_tup_read as index_tuples_read,
            idx_tup_fetch as index_tuples_fetched
          FROM pg_stat_user_indexes
          WHERE schemaname = 'public'
          ORDER BY idx_scan DESC;
        ` as any;
      }
    ).then(result => result.result);
  }

  /**
   * 느린 쿼리 분석
   */
  async getSlowQueries(): Promise<{
    query: string;
    totalTime: number;
    calls: number;
    meanTime: number;
  }[]> {
    return performanceMonitor.measureExecutionTime(
      'analyze-slow-queries',
      async () => {
        // pg_stat_statements 확장이 필요 (실제 운영환경에서 설정)
        return this.prisma.$queryRaw`
          SELECT 
            query,
            total_time,
            calls,
            mean_time
          FROM pg_stat_statements
          WHERE query NOT LIKE '%pg_stat_statements%'
          ORDER BY mean_time DESC
          LIMIT 10;
        ` as any;
      }
    ).then(result => result.result);
  }

  /**
   * 테이블 크기 및 인덱스 크기 분석
   */
  async analyzeTableSizes(): Promise<{
    tableName: string;
    tableSize: string;
    indexSize: string;
    totalSize: string;
    rowCount: number;
  }[]> {
    return performanceMonitor.measureExecutionTime(
      'analyze-table-sizes',
      async () => {
        return this.prisma.$queryRaw`
          SELECT 
            schemaname,
            tablename as table_name,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
            pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size,
            (SELECT reltuples::bigint FROM pg_class WHERE relname = tablename) as row_count
          FROM pg_tables
          WHERE schemaname = 'public'
          ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
        ` as any;
      }
    ).then(result => result.result);
  }

  /**
   * 카테고리별 성능 통계 최적화된 쿼리
   */
  async getOptimizedCategoryStats(userId: string, days: number): Promise<any[]> {
    return performanceMonitor.measureExecutionTime(
      'optimized-category-stats',
      async () => {
        return this.prisma.$queryRaw`
          WITH category_stats AS (
            SELECT 
              p.category_id,
              COUNT(*) as total_reviews,
              SUM(CASE WHEN r.is_success THEN 1 ELSE 0 END) as successful_reviews,
              AVG(r.response_time) as avg_response_time,
              AVG(CASE WHEN r.is_success THEN 1 ELSE 0 END) * 100 as success_rate
            FROM review r
            INNER JOIN problem p ON r.problem_id = p.id
            WHERE r.user_id = ${userId}
              AND r.date >= NOW() - INTERVAL '${days} days'
            GROUP BY p.category_id
          )
          SELECT 
            cs.*,
            c.name as category_name
          FROM category_stats cs
          LEFT JOIN category c ON cs.category_id = c.id
          ORDER BY cs.success_rate DESC;
        ` as unknown as any[];
      }
    ).then(result => result.result);
  }

  /**
   * 시간대별 성능 분석 최적화 쿼리
   */
  async getOptimizedHourlyStats(userId: string, days: number): Promise<any[]> {
    return performanceMonitor.measureExecutionTime(
      'optimized-hourly-stats',
      async () => {
        return this.prisma.$queryRaw`
          SELECT 
            EXTRACT(HOUR FROM r.date) as hour,
            COUNT(*) as total_reviews,
            AVG(CASE WHEN r.is_success THEN 1 ELSE 0 END) * 100 as success_rate,
            AVG(r.response_time) as avg_response_time,
            STDDEV(r.response_time) as response_time_stddev
          FROM review r
          WHERE r.user_id = ${userId}
            AND r.date >= NOW() - INTERVAL '${days} days'
          GROUP BY EXTRACT(HOUR FROM r.date)
          HAVING COUNT(*) >= 5  -- 최소 5개 이상의 리뷰가 있는 시간대만
          ORDER BY hour;
        ` as unknown as any[];
      }
    ).then(result => result.result);
  }

  /**
   * 연결 풀 상태 모니터링
   */
  async getConnectionPoolStats(): Promise<{
    activeConnections: number;
    idleConnections: number;
    totalConnections: number;
    maxConnections: number;
  }> {
    const { result } = await performanceMonitor.measureExecutionTime(
      'connection-pool-stats',
      async () => {
        const [poolStats] = await this.prisma.$queryRaw`
          SELECT 
            (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
            (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections,
            (SELECT count(*) FROM pg_stat_activity) as total_connections,
            (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections;
        ` as any;
        
        return poolStats;
      }
    );

    return result;
  }

  /**
   * 캐시 히트율 분석
   */
  async getCacheHitRatio(): Promise<{
    bufferCacheHitRatio: number;
    indexCacheHitRatio: number;
  }> {
    const { result } = await performanceMonitor.measureExecutionTime(
      'cache-hit-ratio',
      async () => {
        const [stats] = await this.prisma.$queryRaw`
          SELECT 
            ROUND(
              (SELECT sum(blks_hit) * 100.0 / sum(blks_hit + blks_read) 
               FROM pg_stat_database WHERE datname = current_database()), 2
            ) as buffer_cache_hit_ratio,
            ROUND(
              (SELECT sum(idx_blks_hit) * 100.0 / sum(idx_blks_hit + idx_blks_read)
               FROM pg_statio_user_indexes), 2
            ) as index_cache_hit_ratio;
        ` as any;
        
        return stats;
      }
    );

    return result;
  }

  /**
   * 최적화 추천사항 생성
   */
  async generateOptimizationRecommendations(): Promise<{
    category: string;
    recommendation: string;
    priority: 'high' | 'medium' | 'low';
    impact: string;
  }[]> {
    const recommendations: any[] = [];

    try {
      // 인덱스 사용률 체크
      const indexStats = await this.analyzeIndexUsage();
      const unusedIndexes = indexStats.filter(idx => idx.indexScans < 10);
      
      if (unusedIndexes.length > 0) {
        recommendations.push({
          category: 'Index Optimization',
          recommendation: `${unusedIndexes.length}개의 거의 사용되지 않는 인덱스를 삭제하여 INSERT/UPDATE 성능을 향상시키세요.`,
          priority: 'medium',
          impact: 'Write 성능 향상, 저장공간 절약'
        });
      }

      // 캐시 히트율 체크
      const cacheStats = await this.getCacheHitRatio();
      if (cacheStats.bufferCacheHitRatio < 95) {
        recommendations.push({
          category: 'Memory Optimization',
          recommendation: `Buffer cache hit ratio가 ${cacheStats.bufferCacheHitRatio}%입니다. shared_buffers 설정을 증가시키세요.`,
          priority: 'high',
          impact: '쿼리 성능 대폭 향상'
        });
      }

      // 연결 풀 체크
      const poolStats = await this.getConnectionPoolStats();
      const connectionRatio = (poolStats.totalConnections / poolStats.maxConnections) * 100;
      
      if (connectionRatio > 80) {
        recommendations.push({
          category: 'Connection Pool',
          recommendation: `연결 사용률이 ${connectionRatio.toFixed(1)}%입니다. 연결 풀 크기를 조정하거나 연결 누수를 점검하세요.`,
          priority: 'high',
          impact: '동시성 문제 해결, 안정성 향상'
        });
      }

      // 테이블 크기 체크
      const tableSizes = await this.analyzeTableSizes();
      const largeTables = tableSizes.filter((table: any) => 
        table.row_count > 1000000 // 100만 행 이상
      );

      if (largeTables.length > 0) {
        recommendations.push({
          category: 'Data Archiving',
          recommendation: `${largeTables.length}개의 대용량 테이블이 발견되었습니다. 파티셔닝이나 아카이빙을 고려하세요.`,
          priority: 'medium',
          impact: '쿼리 성능 향상, 백업 시간 단축'
        });
      }

    } catch (error) {
      console.error('Error generating optimization recommendations:', error);
      recommendations.push({
        category: 'Analysis Error',
        recommendation: '최적화 분석 중 오류가 발생했습니다. 데이터베이스 상태를 점검하세요.',
        priority: 'high',
        impact: '시스템 안정성'
      });
    }

    return recommendations;
  }
}

export default QueryOptimizer;