import type { Response } from 'express';
import { Router } from 'express';
import { PrismaClient } from "@prisma/client"
import { logger } from '../config/logger.js';
import { authenticateToken, requireAnyRole } from '../middleware/standard-auth.js';
import type { ApiRequest } from '../types/api.js';
import { cacheUtils } from '../config/redis.js';

const router = Router();
const prisma = new PrismaClient();

// 카테고리 목록 조회 (GET /categories)
router.get('/', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { includeChildren = true, includeStats = false } = req.query;

    const cacheKey = `categories:${includeChildren}:${includeStats}`;
    const cached = await cacheUtils.get(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    // 루트 카테고리부터 계층 구조로 조회
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      include: {
        children: includeChildren === 'true' ? {
          where: { isActive: true },
          include: {
            children: {
              where: { isActive: true },
              include: {
                _count: includeStats === 'true' ? {
                  select: { problems: true }
                } : undefined
              }
            },
            _count: includeStats === 'true' ? {
              select: { problems: true }
            } : undefined
          }
        } : false,
        _count: includeStats === 'true' ? {
          select: { problems: true }
        } : undefined
      },
      orderBy: { order: 'asc' }
    });

    await cacheUtils.set(cacheKey, categories, 300); // 5분 캐시
    res.json(categories);

    logger.info(`Categories fetched by user ${req.user?.userId}`, {
      count: categories.length,
      includeChildren,
      includeStats
    });

  } catch (error) {
    logger.error('Error fetching categories:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch categories',
      timestamp: new Date().toISOString()
    });
  }
});

// 특정 카테고리 조회 (GET /categories/:id)
router.get('/:id', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { includeAncestors = false, includeDescendants = false } = req.query;

    const cacheKey = `category:${id}:${includeAncestors}:${includeDescendants}`;
    const cached = await cacheUtils.get(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const category = await prisma.category.findUnique({
      where: { id, isActive: true },
      include: {
        parent: includeAncestors === 'true',
        children: includeDescendants === 'true' ? {
          where: { isActive: true },
          include: {
            children: {
              where: { isActive: true }
            }
          }
        } : false,
        _count: {
          select: { problems: true }
        }
      }
    });

    if (!category) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Category not found',
        timestamp: new Date().toISOString()
      });
    }

    await cacheUtils.set(cacheKey, category, 300); // 5분 캐시
    res.json(category);

    logger.info(`Category ${id} fetched by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error fetching category:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch category',
      timestamp: new Date().toISOString()
    });
  }
});

// 카테고리 생성 (POST /categories)
router.post('/', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const {
      name,
      description,
      parentId,
      order = 0
    } = req.body;

    // 필수 필드 검증
    if (!name) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Name is required',
        timestamp: new Date().toISOString()
      });
    }

    // 부모 카테고리 존재 확인
    if (parentId) {
      const parent = await prisma.category.findUnique({
        where: { id: parentId, isActive: true }
      });

      if (!parent) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Parent category not found',
          timestamp: new Date().toISOString()
        });
      }
    }

    // 같은 레벨에서 중복 이름 확인
    const existing = await prisma.category.findFirst({
      where: {
        name,
        parentId: parentId || null,
        isActive: true
      }
    });

    if (existing) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Category with this name already exists at this level',
        timestamp: new Date().toISOString()
      });
    }

    // Generate slug from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const category = await prisma.category.create({
      data: {
        name,
        description,
        slug,
        parentId,
        order
      },
      include: {
        parent: true,
        children: true,
        _count: {
          select: { problems: true }
        }
      }
    });

    // 캐시 무효화
    await cacheUtils.del('categories:*');

    res.status(201).json(category);

    logger.info(`Category created by user ${req.user?.userId}`, {
      categoryId: category.id,
      name,
      parentId
    });

  } catch (error) {
    logger.error('Error creating category:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create category',
      timestamp: new Date().toISOString()
    });
  }
});

// 카테고리 수정 (PUT /categories/:id)
router.put('/:id', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      parentId,
      order
    } = req.body;

    // 기존 카테고리 확인
    const existingCategory = await prisma.category.findUnique({
      where: { id, isActive: true }
    });

    if (!existingCategory) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Category not found',
        timestamp: new Date().toISOString()
      });
    }

    // 관리자 권한 체크 (카테고리에는 createdById 필드가 없음)
    if (req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only administrators can modify categories',
        timestamp: new Date().toISOString()
      });
    }

    // 부모 카테고리 변경 시 순환 참조 방지
    if (parentId && parentId !== existingCategory.parentId) {
      // 자기 자신을 부모로 설정 방지
      if (parentId === id) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Cannot set category as its own parent',
          timestamp: new Date().toISOString()
        });
      }

      // 자식 카테고리를 부모로 설정 방지 (순환 참조)
      const descendants = await prisma.category.findMany({
        where: {
          OR: [
            { parentId: id },
            { parent: { parentId: id } },
            { parent: { parent: { parentId: id } } }
          ]
        }
      });

      if (descendants.some(desc => desc.id === parentId)) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Cannot create circular reference in category hierarchy',
          timestamp: new Date().toISOString()
        });
      }
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        name,
        description,
        slug: name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : undefined,
        parentId,
        order
      },
      include: {
        parent: true,
        children: true,
        _count: {
          select: { problems: true }
        }
      }
    });

    // 캐시 무효화
    await cacheUtils.del('categories:*');
    await cacheUtils.del(`category:${id}:*`);

    res.json(category);

    logger.info(`Category ${id} updated by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error updating category:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update category',
      timestamp: new Date().toISOString()
    });
  }
});

// 카테고리 삭제 (DELETE /categories/:id)
router.delete('/:id', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;

    // 기존 카테고리 확인
    const existingCategory = await prisma.category.findUnique({
      where: { id, isActive: true },
      include: {
        children: { where: { isActive: true } },
        _count: {
          select: { problems: true }
        }
      }
    });

    if (!existingCategory) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Category not found',
        timestamp: new Date().toISOString()
      });
    }

    // 관리자 권한 체크
    if (req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only administrators can delete categories',
        timestamp: new Date().toISOString()
      });
    }

    // 하위 카테고리가 있으면 삭제 불가
    if (existingCategory.children.length > 0) {
      return res.status(400).json({
        error: 'Bad request',
        message: `Cannot delete category with ${existingCategory.children.length} subcategories. Delete subcategories first.`,
        timestamp: new Date().toISOString()
      });
    }

    // 연결된 문제가 있으면 삭제 불가 (소프트 삭제로 변경)
    if (existingCategory._count.problems > 0) {
      await prisma.category.update({
        where: { id },
        data: { isActive: false }
      });

      logger.info(`Category ${id} soft deleted by user ${req.user?.userId}`, {
        problemCount: existingCategory._count.problems
      });
    } else {
      // 완전 삭제
      await prisma.category.delete({
        where: { id }
      });

      logger.info(`Category ${id} permanently deleted by user ${req.user?.userId}`);
    }

    // 캐시 무효화
    await cacheUtils.del('categories:*');
    await cacheUtils.del(`category:${id}:*`);

    res.status(204).send();

  } catch (error) {
    logger.error('Error deleting category:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete category',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;