import type { Response } from 'express';
import { Router } from 'express';
import { PrismaClient } from "@prisma/client"
import { logger } from '../config/logger.js';
import { authenticateToken, requireAnyRole } from '../middleware/standard-auth.js';
import type { ApiRequest } from '../types/api.js';
import { cacheUtils } from '../config/redis.js';

const router = Router();
const prisma = new PrismaClient();

// 태그 목록 조회 (GET /tags)
router.get('/', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const {
      search,
      sortBy = 'name',
      sortOrder = 'asc',
      limit = 50,
      page = 1,
      minUsage = 0
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // 검색 조건 구성
    const where: any = {
      usageCount: { gte: parseInt(minUsage as string) }
    };

    if (search) {
      where.name = {
        contains: search as string,
        mode: 'insensitive'
      };
    }

    // 정렬 옵션
    const orderBy: any = {};
    if (sortBy === 'usage') {
      orderBy.usageCount = sortOrder;
    } else if (sortBy === 'created') {
      orderBy.createdAt = sortOrder;
    } else {
      orderBy.name = sortOrder;
    }

    const cacheKey = `tags:${JSON.stringify({ where, orderBy, skip, limitNum })}`;
    const cached = await cacheUtils.get(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const [tags, total] = await Promise.all([
      prisma.tag.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          color: true,
          isSystem: true,
          usageCount: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy,
        skip,
        take: limitNum
      }),
      prisma.tag.count({ where })
    ]);

    const result = {
      tags,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };

    await cacheUtils.set(cacheKey, result, 300); // 5분 캐시
    res.json(result);

    logger.info(`Tags fetched by user ${req.user?.userId}`, {
      count: tags.length,
      total,
      filters: { search, minUsage }
    });

  } catch (error) {
    logger.error('Error fetching tags:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch tags',
      timestamp: new Date().toISOString()
    });
  }
});

// 태그 자동완성 (GET /tags/autocomplete)
router.get('/autocomplete', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || (q as string).length < 2) {
      return res.json([]);
    }

    const cacheKey = `tags:autocomplete:${q}:${limit}`;
    const cached = await cacheUtils.get(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const tags = await prisma.tag.findMany({
      where: {
        name: {
          contains: q as string,
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        name: true,
        color: true,
        usageCount: true
      },
      orderBy: [
        { usageCount: 'desc' },
        { name: 'asc' }
      ],
      take: parseInt(limit as string)
    });

    await cacheUtils.set(cacheKey, tags, 600); // 10분 캐시 (더 오래)
    res.json(tags);

  } catch (error) {
    logger.error('Error in tag autocomplete:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch tag suggestions',
      timestamp: new Date().toISOString()
    });
  }
});

// 인기 태그 조회 (GET /tags/popular)
router.get('/popular', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { limit = 20 } = req.query;

    const where: any = {
      usageCount: { gt: 0 }
    };

    const cacheKey = `tags:popular:${limit}`;
    const cached = await cacheUtils.get(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const tags = await prisma.tag.findMany({
      where,
      select: {
        id: true,
        name: true,
        color: true,
        usageCount: true
      },
      orderBy: [
        { usageCount: 'desc' },
        { name: 'asc' }
      ],
      take: parseInt(limit as string)
    });

    await cacheUtils.set(cacheKey, tags, 600); // 10분 캐시
    res.json(tags);

  } catch (error) {
    logger.error('Error fetching popular tags:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch popular tags',
      timestamp: new Date().toISOString()
    });
  }
});

// 특정 태그 조회 (GET /tags/:id)
router.get('/:id', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;

    const cacheKey = `tag:${id}`;
    const cached = await cacheUtils.get(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const tag = await prisma.tag.findUnique({
      where: { id },
      include: {
        problemTags: {
          include: {
            problem: {
              select: {
                id: true,
                title: true,
                difficulty: true,
                isPublic: true
              }
            }
          },
          take: 10 // 최근 10개 문제만
        },
        problemSetTags: {
          include: {
            problemSet: {
              select: {
                id: true,
                title: true,
                isPublic: true
              }
            }
          },
          take: 10 // 최근 10개 문제집만
        }
      }
    });

    if (!tag) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Tag not found',
        timestamp: new Date().toISOString()
      });
    }

    await cacheUtils.set(cacheKey, tag, 300); // 5분 캐시
    res.json(tag);

    logger.info(`Tag ${id} fetched by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error fetching tag:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch tag',
      timestamp: new Date().toISOString()
    });
  }
});

// 태그 생성 (POST /tags)
router.post('/', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const {
      name,
      description,
      color = '#6B7280'
    } = req.body;

    // 필수 필드 검증
    if (!name) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Name is required',
        timestamp: new Date().toISOString()
      });
    }

    // 태그 이름 정규화 (소문자, 공백 제거)
    const normalizedName = name.toLowerCase().trim().replace(/\s+/g, '-');

    // 중복 확인
    const existing = await prisma.tag.findUnique({
      where: {
        name: normalizedName
      }
    });

    if (existing) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Tag with this name already exists',
        timestamp: new Date().toISOString()
      });
    }

    const tag = await prisma.tag.create({
      data: {
        name: normalizedName,
        description,
        color
      }
    });

    // 캐시 무효화
    await cacheUtils.del('tags:*');

    res.status(201).json(tag);

    logger.info(`Tag created by user ${req.user?.userId}`, {
      tagId: tag.id,
      name: normalizedName
    });

  } catch (error) {
    logger.error('Error creating tag:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create tag',
      timestamp: new Date().toISOString()
    });
  }
});

// 태그 수정 (PUT /tags/:id)
router.put('/:id', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      color
    } = req.body;

    // 기존 태그 확인
    const existingTag = await prisma.tag.findUnique({
      where: { id }
    });

    if (!existingTag) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Tag not found',
        timestamp: new Date().toISOString()
      });
    }

    // 관리자 권한 체크
    if (req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only administrators can modify tags',
        timestamp: new Date().toISOString()
      });
    }

    // 이름 변경 시 중복 확인
    if (name && name !== existingTag.name) {
      const normalizedName = name.toLowerCase().trim().replace(/\s+/g, '-');
      
      const duplicate = await prisma.tag.findUnique({
        where: {
          name: normalizedName
        }
      });

      if (duplicate && duplicate.id !== id) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Tag with this name already exists',
          timestamp: new Date().toISOString()
        });
      }
    }

    const tag = await prisma.tag.update({
      where: { id },
      data: {
        name: name ? name.toLowerCase().trim().replace(/\s+/g, '-') : undefined,
        description,
        color
      }
    });

    // 캐시 무효화
    await cacheUtils.del('tags:*');
    await cacheUtils.del(`tag:${id}`);

    res.json(tag);

    logger.info(`Tag ${id} updated by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error updating tag:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update tag',
      timestamp: new Date().toISOString()
    });
  }
});

// 태그 삭제 (DELETE /tags/:id)
router.delete('/:id', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;

    // 기존 태그 확인
    const existingTag = await prisma.tag.findUnique({
      where: { id }
    });

    if (!existingTag) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Tag not found',
        timestamp: new Date().toISOString()
      });
    }

    // 관리자 권한 체크
    if (req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only administrators can delete tags',
        timestamp: new Date().toISOString()
      });
    }

    // 사용 중인 태그는 경고 메시지만 표시
    if (existingTag.usageCount > 0) {
      return res.status(400).json({
        error: 'Bad request',
        message: `Cannot delete tag with ${existingTag.usageCount} usages. Remove from problems/problem-sets first.`,
        timestamp: new Date().toISOString()
      });
    }

    // 사용되지 않은 태그만 삭제
    await prisma.tag.delete({
      where: { id }
    });

    // 캐시 무효화
    await cacheUtils.del('tags:*');
    await cacheUtils.del(`tag:${id}`);

    res.status(204).send();

    logger.info(`Tag ${id} deleted by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error deleting tag:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete tag',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;