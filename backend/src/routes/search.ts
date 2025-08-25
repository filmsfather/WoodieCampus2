import type { Response } from 'express';
import { Router } from 'express';
import { PrismaClient } from "@prisma/client"
import { logger } from '../config/logger.js';
import { authenticateToken } from '../middleware/standard-auth.js';
import type { ApiRequest } from '../types/api.js';
import { cacheUtils } from '../config/redis.js';

const router = Router();
const prisma = new PrismaClient();

// 통합 검색 (GET /search)
router.get('/', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const {
      q, // 키워드 검색
      type = 'all', // problems, problem-sets, all
      categoryId,
      tagIds, // 쉼표로 구분된 태그 ID 목록
      difficulty, // 쉼표로 구분된 난이도 목록 (1,2,3,4,5)
      difficultyMin,
      difficultyMax,
      questionType, // 쉼표로 구분된 문제 유형
      createdBy, // 작성자 ID
      isPublic,
      sortBy = 'relevance', // relevance, title, difficulty, created, updated
      sortOrder = 'desc',
      limit = 20,
      page = 1
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // 캐시 키 생성
    const cacheKey = `search:${JSON.stringify(req.query)}:${req.user?.userId}`;
    const cached = await cacheUtils.get(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const results: any = {
      problems: [],
      problemSets: [],
      totalResults: 0,
      searchInfo: {
        query: q,
        type,
        filters: {
          categoryId,
          tagIds: tagIds ? (tagIds as string).split(',') : [],
          difficulty,
          questionType,
          createdBy,
          isPublic
        }
      }
    };

    // 문제 검색
    if (type === 'problems' || type === 'all') {
      const problemResults = await searchProblems({
        query: q as string,
        categoryId: categoryId as string,
        tagIds: tagIds ? (tagIds as string).split(',') : [],
        difficulty,
        difficultyMin,
        difficultyMax,
        questionType,
        createdBy: createdBy as string,
        isPublic,
        sortBy: sortBy as string,
        sortOrder: sortOrder as string,
        limit: type === 'problems' ? limitNum : Math.ceil(limitNum / 2),
        skip: type === 'problems' ? skip : 0,
        userId: req.user!.userId
      });

      results.problems = problemResults.problems;
      results.totalResults += problemResults.total;
    }

    // 문제집 검색
    if (type === 'problem-sets' || type === 'all') {
      const problemSetResults = await searchProblemSets({
        query: q as string,
        categoryId: categoryId as string,
        tagIds: tagIds ? (tagIds as string).split(',') : [],
        createdBy: createdBy as string,
        isPublic,
        sortBy: sortBy as string,
        sortOrder: sortOrder as string,
        limit: type === 'problem-sets' ? limitNum : Math.ceil(limitNum / 2),
        skip: type === 'problem-sets' ? skip : 0,
        userId: req.user!.userId
      });

      results.problemSets = problemSetResults.problemSets;
      results.totalResults += problemSetResults.total;
    }

    // 검색 히스토리 저장 (키워드가 있는 경우만)
    if (q && (q as string).trim().length > 0) {
      await saveSearchHistory(req.user!.userId, {
        query: q as string,
        type: type as string,
        filters: results.searchInfo.filters,
        resultCount: results.totalResults
      });
    }

    // 페이지네이션 정보
    results.pagination = {
      page: pageNum,
      limit: limitNum,
      total: results.totalResults,
      totalPages: Math.ceil(results.totalResults / limitNum)
    };

    await cacheUtils.set(cacheKey, results, 300); // 5분 캐시
    res.json(results);

    logger.info(`Search performed by user ${req.user?.userId}`, {
      query: q,
      type,
      totalResults: results.totalResults,
      filters: results.searchInfo.filters
    });

  } catch (error) {
    logger.error('Error performing search:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to perform search',
      timestamp: new Date().toISOString()
    });
  }
});

// 문제 검색 함수
async function searchProblems(params: {
  query?: string;
  categoryId?: string;
  tagIds: string[];
  difficulty?: any;
  difficultyMin?: any;
  difficultyMax?: any;
  questionType?: any;
  createdBy?: string;
  isPublic?: any;
  sortBy: string;
  sortOrder: string;
  limit: number;
  skip: number;
  userId: string;
}) {
  const {
    query,
    categoryId,
    tagIds,
    difficulty,
    difficultyMin,
    difficultyMax,
    questionType,
    createdBy,
    isPublic,
    sortBy,
    sortOrder,
    limit,
    skip,
    userId
  } = params;

  // WHERE 조건 구성
  const where: any = {
    isActive: true
  };

  // 권한 체크: 비공개 문제는 작성자나 관리자만 조회 가능
  const userRole = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  if (userRole?.role !== 'ADMIN' && userRole?.role !== 'SUPER_ADMIN') {
    where.OR = [
      { isPublic: true },
      { createdById: userId }
    ];
  }

  // 키워드 검색 (PostgreSQL Full-Text Search)
  if (query && query.trim().length > 0) {
    const searchTerms = query.trim().split(/\s+/).join(' | ');
    where.OR = [
      ...(where.OR || []),
      {
        title: {
          search: searchTerms
        }
      },
      {
        description: {
          search: searchTerms
        }
      },
      {
        content: {
          search: searchTerms
        }
      }
    ];
  }

  // 카테고리 필터
  if (categoryId) {
    where.categoryId = categoryId;
  }

  // 태그 필터
  if (tagIds.length > 0) {
    where.problemTags = {
      some: {
        tagId: { in: tagIds }
      }
    };
  }

  // 난이도 필터
  if (difficulty) {
    const difficultyList = (difficulty as string).split(',').map(d => parseInt(d));
    where.difficulty = { in: difficultyList };
  } else if (difficultyMin || difficultyMax) {
    where.difficulty = {};
    if (difficultyMin) where.difficulty.gte = parseInt(difficultyMin);
    if (difficultyMax) where.difficulty.lte = parseInt(difficultyMax);
  }

  // 문제 유형 필터
  if (questionType) {
    const typeList = (questionType as string).split(',');
    where.questionType = { in: typeList };
  }

  // 작성자 필터
  if (createdBy) {
    where.createdById = createdBy;
  }

  // 공개/비공개 필터
  if (isPublic !== undefined) {
    where.isPublic = isPublic === 'true';
  }

  // 정렬 옵션
  const orderBy: any = {};
  if (sortBy === 'title') {
    orderBy.title = sortOrder;
  } else if (sortBy === 'difficulty') {
    orderBy.difficulty = sortOrder;
  } else if (sortBy === 'created') {
    orderBy.createdAt = sortOrder;
  } else if (sortBy === 'updated') {
    orderBy.updatedAt = sortOrder;
  } else {
    // relevance: 최신순을 기본으로
    orderBy.createdAt = 'desc';
  }

  const [problems, total] = await Promise.all([
    prisma.problem.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        problemTags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
                color: true
              }
            }
          }
        },
        choices: {
          select: {
            id: true,
            text: true,
            order: true
          },
          orderBy: { order: 'asc' }
        }
      },
      orderBy,
      skip,
      take: limit
    }),
    prisma.problem.count({ where })
  ]);

  return { problems, total };
}

// 문제집 검색 함수
async function searchProblemSets(params: {
  query?: string;
  categoryId?: string;
  tagIds: string[];
  createdBy?: string;
  isPublic?: any;
  sortBy: string;
  sortOrder: string;
  limit: number;
  skip: number;
  userId: string;
}) {
  const {
    query,
    categoryId,
    tagIds,
    createdBy,
    isPublic,
    sortBy,
    sortOrder,
    limit,
    skip,
    userId
  } = params;

  // WHERE 조건 구성
  const where: any = {
    isActive: true
  };

  // 권한 체크
  const userRole = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  if (userRole?.role !== 'ADMIN' && userRole?.role !== 'SUPER_ADMIN') {
    where.OR = [
      { isPublic: true },
      { createdById: userId }
    ];
  }

  // 키워드 검색
  if (query && query.trim().length > 0) {
    const searchTerms = query.trim().split(/\s+/).join(' | ');
    where.OR = [
      ...(where.OR || []),
      {
        title: {
          search: searchTerms
        }
      },
      {
        description: {
          search: searchTerms
        }
      },
      {
        instructions: {
          search: searchTerms
        }
      }
    ];
  }

  // 카테고리 필터
  if (categoryId) {
    where.categoryId = categoryId;
  }

  // 태그 필터
  if (tagIds.length > 0) {
    where.problemSetTags = {
      some: {
        tagId: { in: tagIds }
      }
    };
  }

  // 작성자 필터
  if (createdBy) {
    where.createdById = createdBy;
  }

  // 공개/비공개 필터
  if (isPublic !== undefined) {
    where.isPublic = isPublic === 'true';
  }

  // 정렬 옵션
  const orderBy: any = {};
  if (sortBy === 'title') {
    orderBy.title = sortOrder;
  } else if (sortBy === 'difficulty') {
    orderBy.difficulty = sortOrder;
  } else if (sortBy === 'created') {
    orderBy.createdAt = sortOrder;
  } else if (sortBy === 'updated') {
    orderBy.updatedAt = sortOrder;
  } else {
    // relevance: 최신순을 기본으로
    orderBy.createdAt = 'desc';
  }

  const [problemSets, total] = await Promise.all([
    prisma.problemSet.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        problemSetTags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
                color: true
              }
            }
          }
        },
        _count: {
          select: { problems: true }
        }
      },
      orderBy,
      skip,
      take: limit
    }),
    prisma.problemSet.count({ where })
  ]);

  return { problemSets, total };
}

// 검색 히스토리 저장 함수
async function saveSearchHistory(userId: string, searchData: {
  query: string;
  type: string;
  filters: any;
  resultCount: number;
}) {
  try {
    // Redis에 최근 검색어 저장 (최대 20개)
    const historyKey = `search_history:${userId}`;
    const historyItem = {
      ...searchData,
      timestamp: new Date().toISOString()
    };

    // 기존 히스토리 가져오기
    const existingHistory = await cacheUtils.get(historyKey) || [];
    
    // 중복 검색어 제거 (같은 쿼리와 타입)
    const filteredHistory = existingHistory.filter((item: any) => 
      !(item.query === searchData.query && item.type === searchData.type)
    );

    // 새 검색어를 맨 앞에 추가하고 20개로 제한
    const newHistory = [historyItem, ...filteredHistory].slice(0, 20);

    // Redis에 저장 (7일 보관)
    await cacheUtils.set(historyKey, newHistory, 7 * 24 * 60 * 60);

  } catch (error) {
    logger.error('Error saving search history:', error);
    // 검색 히스토리 저장 실패는 메인 기능에 영향 주지 않음
  }
}

// 검색 히스토리 조회 (GET /search/history)
router.get('/history', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const historyKey = `search_history:${req.user!.userId}`;
    const history = await cacheUtils.get(historyKey) || [];

    res.json({
      history,
      count: history.length
    });

  } catch (error) {
    logger.error('Error fetching search history:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch search history',
      timestamp: new Date().toISOString()
    });
  }
});

// 검색 히스토리 삭제 (DELETE /search/history)
router.delete('/history', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const historyKey = `search_history:${req.user!.userId}`;
    await cacheUtils.del(historyKey);

    res.status(204).send();

    logger.info(`Search history cleared by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error clearing search history:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to clear search history',
      timestamp: new Date().toISOString()
    });
  }
});

// 검색 제안 (GET /search/suggestions)
router.get('/suggestions', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { q, limit = 5 } = req.query;

    if (!q || (q as string).length < 2) {
      return res.json({
        suggestions: [],
        categories: [],
        tags: []
      });
    }

    const cacheKey = `search_suggestions:${q}:${limit}`;
    const cached = await cacheUtils.get(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const searchTerm = q as string;

    // 병렬로 제안 데이터 수집
    const [problemTitles, problemSetTitles, categories, tags] = await Promise.all([
      // 문제 제목에서 제안
      prisma.problem.findMany({
        where: {
          isActive: true,
          isPublic: true,
          title: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        },
        select: { title: true },
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' }
      }),
      
      // 문제집 제목에서 제안
      prisma.problemSet.findMany({
        where: {
          isActive: true,
          isPublic: true,
          title: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        },
        select: { title: true },
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' }
      }),

      // 카테고리 제안
      prisma.category.findMany({
        where: {
          isActive: true,
          name: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        },
        select: {
          id: true,
          name: true,
          slug: true
        },
        take: parseInt(limit as string)
      }),

      // 태그 제안
      prisma.tag.findMany({
        where: {
          name: {
            contains: searchTerm,
            mode: 'insensitive'
          }
        },
        select: {
          id: true,
          name: true,
          color: true,
          usageCount: true
        },
        take: parseInt(limit as string),
        orderBy: { usageCount: 'desc' }
      })
    ]);

    // 중복 제거 및 결합
    const suggestions = [
      ...problemTitles.map(p => p.title),
      ...problemSetTitles.map(ps => ps.title)
    ].filter((title, index, array) => array.indexOf(title) === index)
     .slice(0, parseInt(limit as string));

    const result = {
      suggestions,
      categories,
      tags
    };

    await cacheUtils.set(cacheKey, result, 600); // 10분 캐시
    res.json(result);

  } catch (error) {
    logger.error('Error fetching search suggestions:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch search suggestions',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;