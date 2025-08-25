import type { Response } from 'express';
import { Router } from 'express';
import { PrismaClient } from "@prisma/client"
import { logger } from '../config/logger.js';
import { authenticateToken, requireAnyRole } from '../middleware/standard-auth.js';
import type { ApiRequest} from '../types/api.js';
import { UserRole, PaginatedResponse } from '../types/api.js';
import { cacheUtils } from '../config/redis.js';

const router = Router();
const prisma = new PrismaClient();

// 문제집 목록 조회 (GET /problem-sets)
router.get('/', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      categoryId,
      difficulty,
      isPublic,
      isTemplate,
      isShared,
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // 검색 조건 구성
    const where: any = {
      isActive: true,
    };

    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (categoryId) {
      where.categoryId = categoryId as string;
    }

    if (difficulty) {
      where.difficulty = parseInt(difficulty as string);
    }

    if (isPublic !== undefined) {
      where.isPublic = isPublic === 'true';
    }

    if (isTemplate !== undefined) {
      where.isTemplate = isTemplate === 'true';
    }

    if (isShared !== undefined) {
      where.isShared = isShared === 'true';
    }

    // 권한 체크: 비공개 문제집은 작성자나 관리자만 조회 가능
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
      where.OR = [
        { isPublic: true },
        { createdById: req.user?.userId },
      ];
    }

    const cacheKey = `problem-sets:${JSON.stringify({ where, skip, limitNum })}`;
    const cached = await cacheUtils.get(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const [problemSets, total] = await Promise.all([
      prisma.problemSet.findMany({
        where,
        include: {
          category: true,
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          problemSetTags: {
            include: { tag: true },
          },
          _count: {
            select: { problems: true },
          },
        },
        orderBy: [
          { order: 'asc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limitNum,
      }),
      prisma.problemSet.count({ where }),
    ]);

    const result = {
      problemSets,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };

    await cacheUtils.set(cacheKey, result, 300); // 5분 캐시

    res.json(result);

    logger.info(`Problem sets fetched by user ${req.user?.userId}`, {
      count: problemSets.length,
      total,
      filters: { search, categoryId, difficulty, isPublic, isTemplate },
    });

  } catch (error) {
    logger.error('Error fetching problem sets:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch problem sets',
    });
  }
});

// 특정 문제집 조회 (GET /problem-sets/:id)
router.get('/:id', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { includeProblems = true } = req.query;

    const cacheKey = `problem-set:${id}:${includeProblems}`;
    const cached = await cacheUtils.get(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const problemSet = await prisma.problemSet.findUnique({
      where: { id },
      include: {
        category: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        problemSetTags: {
          include: { tag: true },
        },
        problems: includeProblems === 'true' ? {
          where: { isActive: true },
          include: {
            choices: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                text: true,
                order: true,
              },
            },
            problemTags: {
              include: { tag: true },
            },
            category: true,
          },
          orderBy: { order: 'asc' },
        } : false,
        _count: {
          select: { problems: true },
        },
      },
    });

    if (!problemSet) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem set not found',
      });
    }

    // 권한 체크
    if (!problemSet.isPublic && 
        problemSet.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied to this problem set',
      });
    }

    await cacheUtils.set(cacheKey, problemSet, 300); // 5분 캐시

    res.json(problemSet);

    logger.info(`Problem set ${id} fetched by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error fetching problem set:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch problem set',
    });
  }
});

// 문제집 생성 (POST /problem-sets)
router.post('/', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const {
      title,
      description,
      difficulty = 1,
      isPublic = true,
      isTemplate = false,
      order = 0,
      timeLimit,
      totalScore,
      passScore,
      instructions,
      categoryId,
      tagIds = [],
    } = req.body;

    // 필수 필드 검증
    if (!title) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Title is required',
      });
    }

    // 트랜잭션으로 문제집 생성
    const problemSet = await prisma.$transaction(async (tx) => {
      // 문제집 생성
      const newProblemSet = await tx.problemSet.create({
        data: {
          title,
          description,
          difficulty,
          isPublic,
          isTemplate,
          order,
          timeLimit,
          totalScore,
          passScore,
          instructions,
          categoryId,
          createdById: req.user!.userId,
        },
      });

      // 태그 연결
      if (tagIds.length > 0) {
        await tx.problemSetTag.createMany({
          data: tagIds.map((tagId: string) => ({
            problemSetId: newProblemSet.id,
            tagId,
          })),
        });

        // 태그 사용 횟수 증가
        await tx.tag.updateMany({
          where: { id: { in: tagIds } },
          data: { usageCount: { increment: 1 } },
        });
      }

      return newProblemSet;
    });

    // 생성된 문제집을 전체 정보와 함께 반환
    const createdProblemSet = await prisma.problemSet.findUnique({
      where: { id: problemSet.id },
      include: {
        category: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        problemSetTags: {
          include: { tag: true },
        },
        _count: {
          select: { problems: true },
        },
      },
    });

    // 캐시 무효화
    await cacheUtils.del('problem-sets:*');

    res.status(201).json(createdProblemSet);

    logger.info(`Problem set created by user ${req.user?.userId}`, {
      problemSetId: problemSet.id,
      title,
      isTemplate,
    });

  } catch (error) {
    logger.error('Error creating problem set:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create problem set',
    });
  }
});

// 문제집 수정 (PUT /problem-sets/:id)
router.put('/:id', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      difficulty,
      isPublic,
      isTemplate,
      order,
      timeLimit,
      totalScore,
      passScore,
      instructions,
      categoryId,
      tagIds = [],
    } = req.body;

    // 기존 문제집 확인 및 권한 체크
    const existingProblemSet = await prisma.problemSet.findUnique({
      where: { id },
      include: {
        problemSetTags: true,
      },
    });

    if (!existingProblemSet) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem set not found',
      });
    }

    if (existingProblemSet.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot modify this problem set',
      });
    }

    // 트랜잭션으로 문제집 수정
    const updatedProblemSet = await prisma.$transaction(async (tx) => {
      // 문제집 정보 수정
      const problemSet = await tx.problemSet.update({
        where: { id },
        data: {
          title,
          description,
          difficulty,
          isPublic,
          isTemplate,
          order,
          timeLimit,
          totalScore,
          passScore,
          instructions,
          categoryId,
        },
      });

      // 기존 태그 연결 해제
      const oldTagIds = existingProblemSet.problemSetTags.map(pst => pst.tagId);
      await tx.problemSetTag.deleteMany({
        where: { problemSetId: id },
      });

      // 기존 태그 사용 횟수 감소
      if (oldTagIds.length > 0) {
        await tx.tag.updateMany({
          where: { id: { in: oldTagIds } },
          data: { usageCount: { decrement: 1 } },
        });
      }

      // 새 태그 연결
      if (tagIds.length > 0) {
        await tx.problemSetTag.createMany({
          data: tagIds.map((tagId: string) => ({
            problemSetId: id,
            tagId,
          })),
        });

        // 새 태그 사용 횟수 증가
        await tx.tag.updateMany({
          where: { id: { in: tagIds } },
          data: { usageCount: { increment: 1 } },
        });
      }

      return problemSet;
    });

    // 수정된 문제집을 전체 정보와 함께 반환
    const result = await prisma.problemSet.findUnique({
      where: { id },
      include: {
        category: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        problemSetTags: {
          include: { tag: true },
        },
        _count: {
          select: { problems: true },
        },
      },
    });

    // 캐시 무효화
    await cacheUtils.del('problem-sets:*');
    await cacheUtils.del(`problem-set:${id}:*`);

    res.json(result);

    logger.info(`Problem set ${id} updated by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error updating problem set:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update problem set',
    });
  }
});

// 문제집 삭제 (DELETE /problem-sets/:id)
router.delete('/:id', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;

    // 기존 문제집 확인 및 권한 체크
    const existingProblemSet = await prisma.problemSet.findUnique({
      where: { id },
      include: {
        problemSetTags: true,
        _count: {
          select: { problems: true },
        },
      },
    });

    if (!existingProblemSet) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem set not found',
      });
    }

    if (existingProblemSet.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot delete this problem set',
      });
    }

    // 문제가 있는 문제집은 삭제 전 확인
    if (existingProblemSet._count.problems > 0) {
      return res.status(400).json({
        error: 'Bad request',
        message: `Cannot delete problem set with ${existingProblemSet._count.problems} problems. Delete all problems first.`,
      });
    }

    // 트랜잭션으로 문제집 삭제
    await prisma.$transaction(async (tx) => {
      // 태그 사용 횟수 감소
      const tagIds = existingProblemSet.problemSetTags.map(pst => pst.tagId);
      if (tagIds.length > 0) {
        await tx.tag.updateMany({
          where: { id: { in: tagIds } },
          data: { usageCount: { decrement: 1 } },
        });
      }

      // 문제집 삭제 (연관된 태그 연결 등은 CASCADE로 자동 삭제)
      await tx.problemSet.delete({
        where: { id },
      });
    });

    // 캐시 무효화
    await cacheUtils.del('problem-sets:*');
    await cacheUtils.del(`problem-set:${id}:*`);

    res.status(204).send();

    logger.info(`Problem set ${id} deleted by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error deleting problem set:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete problem set',
    });
  }
});

// 템플릿에서 문제집 생성 (POST /problem-sets/from-template/:templateId)
router.post('/from-template/:templateId', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { templateId } = req.params;
    const {
      title,
      description,
      isPublic = true,
      categoryId,
      tagIds = [],
    } = req.body;

    // 템플릿 존재 확인
    const template = await prisma.problemSet.findUnique({
      where: { 
        id: templateId,
        isTemplate: true,
        isActive: true,
      },
      include: {
        problems: {
          where: { isActive: true },
          include: {
            choices: { orderBy: { order: 'asc' } },
            problemTags: { include: { tag: true } },
          },
          orderBy: { order: 'asc' },
        },
        problemSetTags: { include: { tag: true } },
      },
    });

    if (!template) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Template not found or not accessible',
      });
    }

    // 템플릿 접근 권한 체크
    if (!template.isPublic && 
        template.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied to this template',
      });
    }

    // 트랜잭션으로 템플릿에서 문제집 생성
    const newProblemSet = await prisma.$transaction(async (tx) => {
      // 새 문제집 생성
      const problemSet = await tx.problemSet.create({
        data: {
          title: title || `${template.title} (Copy)`,
          description: description || template.description,
          difficulty: template.difficulty,
          isPublic,
          isTemplate: false, // 복사본은 템플릿이 아님
          timeLimit: template.timeLimit,
          totalScore: template.totalScore,
          passScore: template.passScore,
          instructions: template.instructions,
          categoryId: categoryId || template.categoryId,
          createdById: req.user!.userId,
        },
      });

      // 문제들 복사
      for (const problem of template.problems) {
        const newProblem = await tx.problem.create({
          data: {
            title: problem.title,
            description: problem.description,
            content: problem.content,
            questionType: problem.questionType,
            solution: problem.solution,
            explanation: problem.explanation,
            hints: problem.hints,
            difficulty: problem.difficulty,
            estimatedTime: problem.estimatedTime,
            score: problem.score,
            isPublic: problem.isPublic,
            order: problem.order,
            attachments: problem.attachments,
            metadata: problem.metadata as any,
            problemSetId: problemSet.id,
            categoryId: problem.categoryId,
            createdById: req.user!.userId,
          },
        });

        // 선택지 복사
        if (problem.choices.length > 0) {
          await tx.choice.createMany({
            data: problem.choices.map((choice) => ({
              text: choice.text,
              isCorrect: choice.isCorrect,
              order: choice.order,
              feedback: choice.feedback,
              problemId: newProblem.id,
            })),
          });
        }

        // 문제 태그 복사
        if (problem.problemTags.length > 0) {
          await tx.problemTag.createMany({
            data: problem.problemTags.map((pt) => ({
              problemId: newProblem.id,
              tagId: pt.tagId,
            })),
          });

          // 태그 사용 횟수 증가
          const tagIds = problem.problemTags.map(pt => pt.tagId);
          await tx.tag.updateMany({
            where: { id: { in: tagIds } },
            data: { usageCount: { increment: 1 } },
          });
        }
      }

      // 문제집 태그 처리
      const finalTagIds = tagIds.length > 0 ? tagIds : template.problemSetTags.map(pst => pst.tagId);
      if (finalTagIds.length > 0) {
        await tx.problemSetTag.createMany({
          data: finalTagIds.map((tagId: string) => ({
            problemSetId: problemSet.id,
            tagId,
          })),
        });

        // 태그 사용 횟수 증가
        await tx.tag.updateMany({
          where: { id: { in: finalTagIds } },
          data: { usageCount: { increment: 1 } },
        });
      }

      // 템플릿 다운로드 횟수 증가
      await tx.problemSet.update({
        where: { id: templateId },
        data: { downloadCount: { increment: 1 } },
      });

      return problemSet;
    });

    // 생성된 문제집 조회 (전체 정보 포함)
    const result = await prisma.problemSet.findUnique({
      where: { id: newProblemSet.id },
      include: {
        problems: {
          where: { isActive: true },
          include: {
            choices: { orderBy: { order: 'asc' } },
            problemTags: { include: { tag: true } },
            category: true,
          },
          orderBy: { order: 'asc' },
        },
        problemSetTags: { include: { tag: true } },
        category: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        _count: {
          select: { problems: true },
        },
      },
    });

    // 캐시 무효화
    await cacheUtils.del('problem-sets:*');

    res.status(201).json(result);

    logger.info(`Problem set created from template ${templateId} by user ${req.user?.userId}`, {
      newProblemSetId: newProblemSet.id,
      templateTitle: template.title,
      problemsCount: template.problems.length,
    });

  } catch (error) {
    logger.error('Error creating problem set from template:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create problem set from template',
    });
  }
});

// 문제집을 템플릿으로 저장 (POST /problem-sets/:id/save-as-template)
router.post('/:id/save-as-template', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      isPublic = true,
      categoryId,
      tagIds = [],
    } = req.body;

    // 원본 문제집 확인 및 권한 체크
    const originalProblemSet = await prisma.problemSet.findUnique({
      where: { id },
      include: {
        problems: {
          where: { isActive: true },
          include: {
            choices: { orderBy: { order: 'asc' } },
            problemTags: { include: { tag: true } },
          },
          orderBy: { order: 'asc' },
        },
        problemSetTags: { include: { tag: true } },
      },
    });

    if (!originalProblemSet) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem set not found',
      });
    }

    if (originalProblemSet.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot create template from this problem set',
      });
    }

    // 트랜잭션으로 템플릿 생성
    const template = await prisma.$transaction(async (tx) => {
      // 템플릿 생성
      const newTemplate = await tx.problemSet.create({
        data: {
          title: title || `${originalProblemSet.title} (Template)`,
          description: description || originalProblemSet.description,
          difficulty: originalProblemSet.difficulty,
          isPublic,
          isTemplate: true, // 템플릿으로 설정
          timeLimit: originalProblemSet.timeLimit,
          totalScore: originalProblemSet.totalScore,
          passScore: originalProblemSet.passScore,
          instructions: originalProblemSet.instructions,
          categoryId: categoryId || originalProblemSet.categoryId,
          createdById: req.user!.userId,
        },
      });

      // 문제들 복사
      for (const problem of originalProblemSet.problems) {
        const newProblem = await tx.problem.create({
          data: {
            title: problem.title,
            description: problem.description,
            content: problem.content,
            questionType: problem.questionType,
            solution: problem.solution,
            explanation: problem.explanation,
            hints: problem.hints,
            difficulty: problem.difficulty,
            estimatedTime: problem.estimatedTime,
            score: problem.score,
            isPublic: problem.isPublic,
            order: problem.order,
            attachments: problem.attachments,
            metadata: problem.metadata as any,
            problemSetId: newTemplate.id,
            categoryId: problem.categoryId,
            createdById: req.user!.userId,
          },
        });

        // 선택지 복사
        if (problem.choices.length > 0) {
          await tx.choice.createMany({
            data: problem.choices.map((choice) => ({
              text: choice.text,
              isCorrect: choice.isCorrect,
              order: choice.order,
              feedback: choice.feedback,
              problemId: newProblem.id,
            })),
          });
        }

        // 문제 태그 복사
        if (problem.problemTags.length > 0) {
          await tx.problemTag.createMany({
            data: problem.problemTags.map((pt) => ({
              problemId: newProblem.id,
              tagId: pt.tagId,
            })),
          });

          // 태그 사용 횟수 증가
          const tagIds = problem.problemTags.map(pt => pt.tagId);
          await tx.tag.updateMany({
            where: { id: { in: tagIds } },
            data: { usageCount: { increment: 1 } },
          });
        }
      }

      // 문제집 태그 처리
      const finalTagIds = tagIds.length > 0 ? tagIds : originalProblemSet.problemSetTags.map(pst => pst.tagId);
      if (finalTagIds.length > 0) {
        await tx.problemSetTag.createMany({
          data: finalTagIds.map((tagId: string) => ({
            problemSetId: newTemplate.id,
            tagId,
          })),
        });

        // 태그 사용 횟수 증가
        await tx.tag.updateMany({
          where: { id: { in: finalTagIds } },
          data: { usageCount: { increment: 1 } },
        });
      }

      return newTemplate;
    });

    // 생성된 템플릿 조회 (전체 정보 포함)
    const result = await prisma.problemSet.findUnique({
      where: { id: template.id },
      include: {
        problems: {
          where: { isActive: true },
          include: {
            choices: { orderBy: { order: 'asc' } },
            problemTags: { include: { tag: true } },
            category: true,
          },
          orderBy: { order: 'asc' },
        },
        problemSetTags: { include: { tag: true } },
        category: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        _count: {
          select: { problems: true },
        },
      },
    });

    // 캐시 무효화
    await cacheUtils.del('problem-sets:*');

    res.status(201).json(result);

    logger.info(`Template created from problem set ${id} by user ${req.user?.userId}`, {
      templateId: template.id,
      originalTitle: originalProblemSet.title,
      problemsCount: originalProblemSet.problems.length,
    });

  } catch (error) {
    logger.error('Error creating template from problem set:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create template from problem set',
    });
  }
});

// 문제집 공유 링크 생성 (POST /problem-sets/:id/share)
router.post('/:id/share', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      permission = 'READ',
      expiresIn, // 시간(분) 또는 ISO 날짜 문자열
      sharedWithId, // 특정 사용자 ID (선택적)
    } = req.body;

    // 문제집 존재 확인 및 권한 체크
    const problemSet = await prisma.problemSet.findUnique({
      where: { id },
    });

    if (!problemSet) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem set not found',
      });
    }

    if (problemSet.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot share this problem set',
      });
    }

    // 만료 시간 계산
    let expiresAt: Date | null = null;
    if (expiresIn) {
      if (typeof expiresIn === 'number') {
        // 분 단위로 입력된 경우
        expiresAt = new Date(Date.now() + expiresIn * 60 * 1000);
      } else {
        // ISO 문자열로 입력된 경우
        expiresAt = new Date(expiresIn);
      }
    }

    // 공유 토큰 생성 (crypto를 사용하여 안전한 토큰 생성)
    const shareToken = Buffer.from(`${id}-${Date.now()}-${Math.random()}`).toString('base64').replace(/[/+=]/g, '').substring(0, 32);
    const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/shared/problem-sets/${shareToken}`;

    // 공유 정보 저장
    const sharedProblemSet = await prisma.sharedProblemSet.create({
      data: {
        shareToken,
        shareUrl,
        permission,
        expiresAt,
        problemSetId: id,
        sharedById: req.user!.userId,
        sharedWithId,
      },
      include: {
        problemSet: {
          select: {
            id: true,
            title: true,
            description: true,
          },
        },
        sharedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        sharedWith: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // 문제집의 공유 상태 업데이트
    await prisma.problemSet.update({
      where: { id },
      data: { isShared: true },
    });

    // 캐시 무효화
    await cacheUtils.del(`problem-set:${id}:*`);

    res.status(201).json(sharedProblemSet);

    logger.info(`Problem set ${id} shared by user ${req.user?.userId}`, {
      shareToken,
      permission,
      sharedWithId,
      expiresAt: expiresAt?.toISOString(),
    });

  } catch (error) {
    logger.error('Error sharing problem set:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to share problem set',
    });
  }
});

// 공유된 문제집 접근 (GET /problem-sets/shared/:shareToken)
router.get('/shared/:shareToken', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { shareToken } = req.params;

    // 공유 정보 조회
    const sharedProblemSet = await prisma.sharedProblemSet.findUnique({
      where: { shareToken },
      include: {
        problemSet: {
          include: {
            problems: {
              where: { isActive: true },
              include: {
                choices: {
                  orderBy: { order: 'asc' },
                  select: {
                    id: true,
                    text: true,
                    order: true,
                    // 권한에 따라 정답 정보 제어 (READ 권한에서는 숨김)
                  },
                },
                problemTags: { include: { tag: true } },
                category: true,
              },
              orderBy: { order: 'asc' },
            },
            problemSetTags: { include: { tag: true } },
            category: true,
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            _count: {
              select: { problems: true },
            },
          },
        },
        sharedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        sharedWith: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!sharedProblemSet) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Shared problem set not found or invalid token',
      });
    }

    // 공유 활성 상태 및 만료 체크
    if (!sharedProblemSet.isActive) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'This share link has been deactivated',
      });
    }

    if (sharedProblemSet.expiresAt && sharedProblemSet.expiresAt < new Date()) {
      return res.status(410).json({
        error: 'Gone',
        message: 'This share link has expired',
      });
    }

    // 특정 사용자 공유인 경우 권한 체크
    if (sharedProblemSet.sharedWithId && sharedProblemSet.sharedWithId !== req.user?.userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You are not authorized to access this shared problem set',
      });
    }

    // READ 권한의 경우 정답 정보 제거
    if (sharedProblemSet.permission === 'READ') {
      sharedProblemSet.problemSet.problems.forEach((problem: any) => {
        problem.choices.forEach((choice: any) => {
          delete choice.isCorrect;
          delete choice.feedback;
        });
        problem.solution = null;
        problem.explanation = null;
      });
    }

    // 접근 횟수 및 마지막 접근 시간 업데이트
    await prisma.sharedProblemSet.update({
      where: { id: sharedProblemSet.id },
      data: {
        accessCount: { increment: 1 },
        lastAccessed: new Date(),
      },
    });

    res.json({
      ...sharedProblemSet,
      shareInfo: {
        permission: sharedProblemSet.permission,
        expiresAt: sharedProblemSet.expiresAt,
        accessCount: sharedProblemSet.accessCount + 1,
      },
    });

    logger.info(`Shared problem set accessed via token ${shareToken} by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error accessing shared problem set:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to access shared problem set',
    });
  }
});

// 공유 링크 목록 조회 (GET /problem-sets/:id/shares)
router.get('/:id/shares', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;

    // 문제집 존재 확인 및 권한 체크
    const problemSet = await prisma.problemSet.findUnique({
      where: { id },
    });

    if (!problemSet) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem set not found',
      });
    }

    if (problemSet.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot view shares for this problem set',
      });
    }

    // 공유 목록 조회
    const shares = await prisma.sharedProblemSet.findMany({
      where: { problemSetId: id },
      include: {
        sharedWith: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ shares });

    logger.info(`Shares list fetched for problem set ${id} by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error fetching shares:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch shares',
    });
  }
});

// 공유 링크 삭제/비활성화 (DELETE /problem-sets/shares/:shareId)
router.delete('/shares/:shareId', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { shareId } = req.params;

    // 공유 정보 조회 및 권한 체크
    const sharedProblemSet = await prisma.sharedProblemSet.findUnique({
      where: { id: shareId },
      include: {
        problemSet: true,
      },
    });

    if (!sharedProblemSet) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Share not found',
      });
    }

    if (sharedProblemSet.sharedById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot delete this share',
      });
    }

    // 공유 삭제
    await prisma.sharedProblemSet.delete({
      where: { id: shareId },
    });

    // 다른 활성 공유가 있는지 확인
    const otherShares = await prisma.sharedProblemSet.findMany({
      where: {
        problemSetId: sharedProblemSet.problemSetId,
        isActive: true,
      },
    });

    // 다른 공유가 없으면 문제집의 공유 상태 업데이트
    if (otherShares.length === 0) {
      await prisma.problemSet.update({
        where: { id: sharedProblemSet.problemSetId },
        data: { isShared: false },
      });
    }

    res.status(204).send();

    logger.info(`Share ${shareId} deleted by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error deleting share:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete share',
    });
  }
});

// 문제집 버전 생성 (POST /problem-sets/:id/versions)
router.post('/:id/versions', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      versionNumber,
      title,
      description,
      changeLog,
    } = req.body;

    // 문제집 존재 확인 및 권한 체크
    const problemSet = await prisma.problemSet.findUnique({
      where: { id },
      include: {
        problems: {
          where: { isActive: true },
          include: {
            choices: { orderBy: { order: 'asc' } },
            problemTags: { include: { tag: true } },
            category: true,
          },
          orderBy: { order: 'asc' },
        },
        problemSetTags: { include: { tag: true } },
        category: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!problemSet) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem set not found',
      });
    }

    if (problemSet.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot create version for this problem set',
      });
    }

    // 자동 버전 번호 생성 (제공되지 않은 경우)
    let finalVersionNumber = versionNumber;
    if (!finalVersionNumber) {
      const latestVersion = await prisma.problemSetVersion.findFirst({
        where: { problemSetId: id },
        orderBy: { createdAt: 'desc' },
        select: { versionNumber: true },
      });

      if (latestVersion) {
        // 기존 버전에서 증가
        const lastNumber = latestVersion.versionNumber.split('.').map(n => parseInt(n));
        lastNumber[lastNumber.length - 1]++; // 마이너 버전 증가
        finalVersionNumber = lastNumber.join('.');
      } else {
        // 첫 번째 버전
        finalVersionNumber = '1.0';
      }
    }

    // 문제집 전체 데이터 스냅샷 생성
    const problemSetSnapshot = {
      ...problemSet,
      snapshotDate: new Date().toISOString(),
      versionInfo: {
        versionNumber: finalVersionNumber,
        title: title || `Version ${finalVersionNumber}`,
        changeLog: changeLog || 'Version snapshot created',
      },
    };

    // 트랜잭션으로 버전 생성
    const version = await prisma.$transaction(async (tx) => {
      // 기존 현재 버전들을 비활성화
      await tx.problemSetVersion.updateMany({
        where: { 
          problemSetId: id,
          isCurrent: true,
        },
        data: { isCurrent: false },
      });

      // 새 버전 생성
      const newVersion = await tx.problemSetVersion.create({
        data: {
          versionNumber: finalVersionNumber,
          title: title || `Version ${finalVersionNumber}`,
          description: description || 'Automated version snapshot',
          problemSetData: problemSetSnapshot as any,
          changeLog: changeLog || `Created version ${finalVersionNumber}`,
          isActive: true,
          isCurrent: true,
          problemSetId: id,
          createdById: req.user!.userId,
        },
        include: {
          problemSet: {
            select: {
              id: true,
              title: true,
              description: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      return newVersion;
    });

    res.status(201).json(version);

    logger.info(`Version ${finalVersionNumber} created for problem set ${id} by user ${req.user?.userId}`, {
      versionId: version.id,
      versionNumber: finalVersionNumber,
    });

  } catch (error) {
    logger.error('Error creating problem set version:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create problem set version',
    });
  }
});

// 문제집 버전 목록 조회 (GET /problem-sets/:id/versions)
router.get('/:id/versions', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, includeData = false } = req.query;

    // 문제집 존재 확인 및 권한 체크
    const problemSet = await prisma.problemSet.findUnique({
      where: { id },
    });

    if (!problemSet) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem set not found',
      });
    }

    if (problemSet.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot view versions for this problem set',
      });
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // 버전 목록 조회
    const selectFields: any = {
      id: true,
      versionNumber: true,
      title: true,
      description: true,
      isActive: true,
      isCurrent: true,
      changeLog: true,
      createdAt: true,
      updatedAt: true,
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    };

    // 데이터 포함 여부에 따라 선택 필드 조정
    if (includeData === 'true') {
      selectFields.problemSetData = true;
    }

    const [versions, total] = await Promise.all([
      prisma.problemSetVersion.findMany({
        where: { 
          problemSetId: id,
          isActive: true,
        },
        select: selectFields,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.problemSetVersion.count({
        where: { 
          problemSetId: id,
          isActive: true,
        },
      }),
    ]);

    res.json({
      versions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });

    logger.info(`Versions list fetched for problem set ${id} by user ${req.user?.userId}`, {
      versionsCount: versions.length,
      total,
    });

  } catch (error) {
    logger.error('Error fetching problem set versions:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch problem set versions',
    });
  }
});

// 특정 버전 조회 (GET /problem-sets/:id/versions/:versionId)
router.get('/:id/versions/:versionId', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id, versionId } = req.params;

    // 문제집 존재 확인 및 권한 체크
    const problemSet = await prisma.problemSet.findUnique({
      where: { id },
    });

    if (!problemSet) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem set not found',
      });
    }

    if (problemSet.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot view versions for this problem set',
      });
    }

    // 버전 조회
    const version = await prisma.problemSetVersion.findUnique({
      where: { 
        id: versionId,
        problemSetId: id,
      },
      include: {
        problemSet: {
          select: {
            id: true,
            title: true,
            description: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!version) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Version not found',
      });
    }

    res.json(version);

    logger.info(`Version ${versionId} fetched for problem set ${id} by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error fetching problem set version:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch problem set version',
    });
  }
});

// 버전으로부터 문제집 복원 (POST /problem-sets/:id/versions/:versionId/restore)
router.post('/:id/versions/:versionId/restore', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id, versionId } = req.params;
    const { createNewVersion = true, changeLog } = req.body;

    // 문제집 존재 확인 및 권한 체크
    const problemSet = await prisma.problemSet.findUnique({
      where: { id },
    });

    if (!problemSet) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem set not found',
      });
    }

    if (problemSet.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot restore versions for this problem set',
      });
    }

    // 복원할 버전 조회
    const version = await prisma.problemSetVersion.findUnique({
      where: { 
        id: versionId,
        problemSetId: id,
        isActive: true,
      },
    });

    if (!version) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Version not found or inactive',
      });
    }

    // 버전 데이터에서 문제집 정보 추출
    const versionData = version.problemSetData as any;
    if (!versionData || typeof versionData !== 'object') {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Invalid version data',
      });
    }

    // 트랜잭션으로 복원 수행
    const restoredProblemSet = await prisma.$transaction(async (tx) => {
      // 현재 버전 백업 생성 (옵션)
      if (createNewVersion) {
        // 현재 문제집 상태 백업
        const currentProblemSet = await tx.problemSet.findUnique({
          where: { id },
          include: {
            problems: {
              where: { isActive: true },
              include: {
                choices: { orderBy: { order: 'asc' } },
                problemTags: { include: { tag: true } },
                category: true,
              },
              orderBy: { order: 'asc' },
            },
            problemSetTags: { include: { tag: true } },
            category: true,
          },
        });

        if (currentProblemSet) {
          // 현재 상태를 백업 버전으로 저장
          const backupVersionNumber = `backup-${Date.now()}`;
          await tx.problemSetVersion.create({
            data: {
              versionNumber: backupVersionNumber,
              title: `Backup before restore to ${version.versionNumber}`,
              description: 'Automatic backup before version restore',
              problemSetData: currentProblemSet as any,
              changeLog: `Backup created before restoring to version ${version.versionNumber}`,
              isActive: true,
              isCurrent: false,
              problemSetId: id,
              createdById: req.user!.userId,
            },
          });
        }
      }

      // 기존 문제들 모두 비활성화 (삭제 대신)
      await tx.problem.updateMany({
        where: { problemSetId: id },
        data: { isActive: false },
      });

      // 기존 문제집 태그 삭제
      await tx.problemSetTag.deleteMany({
        where: { problemSetId: id },
      });

      // 버전 데이터에서 문제집 복원
      const updatedProblemSet = await tx.problemSet.update({
        where: { id },
        data: {
          title: versionData.title,
          description: versionData.description,
          difficulty: versionData.difficulty,
          isPublic: versionData.isPublic,
          isTemplate: versionData.isTemplate,
          timeLimit: versionData.timeLimit,
          totalScore: versionData.totalScore,
          passScore: versionData.passScore,
          instructions: versionData.instructions,
          categoryId: versionData.categoryId,
        },
      });

      // 문제들 복원
      if (versionData.problems && Array.isArray(versionData.problems)) {
        for (const problemData of versionData.problems) {
          const restoredProblem = await tx.problem.create({
            data: {
              title: problemData.title,
              description: problemData.description,
              content: problemData.content,
              questionType: problemData.questionType,
              solution: problemData.solution,
              explanation: problemData.explanation,
              hints: problemData.hints || [],
              difficulty: problemData.difficulty,
              estimatedTime: problemData.estimatedTime,
              score: problemData.score,
              isPublic: problemData.isPublic,
              isActive: true,
              order: problemData.order,
              attachments: problemData.attachments || [],
              metadata: problemData.metadata as any,
              problemSetId: id,
              categoryId: problemData.categoryId,
              createdById: req.user!.userId,
            },
          });

          // 선택지 복원
          if (problemData.choices && Array.isArray(problemData.choices)) {
            await tx.choice.createMany({
              data: problemData.choices.map((choice: any) => ({
                text: choice.text,
                isCorrect: choice.isCorrect,
                order: choice.order,
                feedback: choice.feedback,
                problemId: restoredProblem.id,
              })),
            });
          }

          // 문제 태그 복원
          if (problemData.problemTags && Array.isArray(problemData.problemTags)) {
            const validTagIds = [];
            for (const pt of problemData.problemTags) {
              // 태그 존재 확인
              const tagExists = await tx.tag.findUnique({
                where: { id: pt.tagId },
              });
              if (tagExists) {
                validTagIds.push(pt.tagId);
              }
            }

            if (validTagIds.length > 0) {
              await tx.problemTag.createMany({
                data: validTagIds.map((tagId) => ({
                  problemId: restoredProblem.id,
                  tagId,
                })),
              });

              // 태그 사용 횟수 증가
              await tx.tag.updateMany({
                where: { id: { in: validTagIds } },
                data: { usageCount: { increment: 1 } },
              });
            }
          }
        }
      }

      // 문제집 태그 복원
      if (versionData.problemSetTags && Array.isArray(versionData.problemSetTags)) {
        const validTagIds = [];
        for (const pst of versionData.problemSetTags) {
          const tagExists = await tx.tag.findUnique({
            where: { id: pst.tagId },
          });
          if (tagExists) {
            validTagIds.push(pst.tagId);
          }
        }

        if (validTagIds.length > 0) {
          await tx.problemSetTag.createMany({
            data: validTagIds.map((tagId) => ({
              problemSetId: id,
              tagId,
            })),
          });

          // 태그 사용 횟수 증가
          await tx.tag.updateMany({
            where: { id: { in: validTagIds } },
            data: { usageCount: { increment: 1 } },
          });
        }
      }

      // 복원된 버전을 현재 버전으로 설정
      await tx.problemSetVersion.updateMany({
        where: { problemSetId: id },
        data: { isCurrent: false },
      });

      await tx.problemSetVersion.update({
        where: { id: versionId },
        data: { isCurrent: true },
      });

      return updatedProblemSet;
    });

    // 캐시 무효화
    await cacheUtils.del('problem-sets:*');
    await cacheUtils.del(`problem-set:${id}:*`);

    // 복원된 문제집 조회 (전체 정보 포함)
    const result = await prisma.problemSet.findUnique({
      where: { id },
      include: {
        problems: {
          where: { isActive: true },
          include: {
            choices: { orderBy: { order: 'asc' } },
            problemTags: { include: { tag: true } },
            category: true,
          },
          orderBy: { order: 'asc' },
        },
        problemSetTags: { include: { tag: true } },
        category: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        _count: {
          select: { problems: true },
        },
      },
    });

    res.json({
      problemSet: result,
      restoredFromVersion: {
        id: version.id,
        versionNumber: version.versionNumber,
        title: version.title,
      },
    });

    logger.info(`Problem set ${id} restored from version ${version.versionNumber} by user ${req.user?.userId}`, {
      versionId,
      versionNumber: version.versionNumber,
      createNewVersion,
    });

  } catch (error) {
    logger.error('Error restoring problem set from version:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to restore problem set from version',
    });
  }
});

// 버전 비교 (GET /problem-sets/:id/versions/:versionId/compare/:compareVersionId)
router.get('/:id/versions/:versionId/compare/:compareVersionId', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id, versionId, compareVersionId } = req.params;

    // 문제집 존재 확인 및 권한 체크
    const problemSet = await prisma.problemSet.findUnique({
      where: { id },
    });

    if (!problemSet) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem set not found',
      });
    }

    if (problemSet.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot compare versions for this problem set',
      });
    }

    // 두 버전 조회
    const [version1, version2] = await Promise.all([
      prisma.problemSetVersion.findUnique({
        where: { 
          id: versionId,
          problemSetId: id,
          isActive: true,
        },
        select: {
          id: true,
          versionNumber: true,
          title: true,
          description: true,
          problemSetData: true,
          createdAt: true,
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.problemSetVersion.findUnique({
        where: { 
          id: compareVersionId,
          problemSetId: id,
          isActive: true,
        },
        select: {
          id: true,
          versionNumber: true,
          title: true,
          description: true,
          problemSetData: true,
          createdAt: true,
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    if (!version1 || !version2) {
      return res.status(404).json({
        error: 'Not found',
        message: 'One or both versions not found',
      });
    }

    // 간단한 diff 생성 (기본적인 필드 비교)
    const data1 = version1.problemSetData as any;
    const data2 = version2.problemSetData as any;

    const diff = {
      metadata: {
        version1: {
          id: version1.id,
          versionNumber: version1.versionNumber,
          title: version1.title,
          createdAt: version1.createdAt,
          createdBy: version1.createdBy,
        },
        version2: {
          id: version2.id,
          versionNumber: version2.versionNumber,
          title: version2.title,
          createdAt: version2.createdAt,
          createdBy: version2.createdBy,
        },
      },
      changes: {
        title: data1?.title !== data2?.title ? {
          from: data1?.title,
          to: data2?.title,
        } : null,
        description: data1?.description !== data2?.description ? {
          from: data1?.description,
          to: data2?.description,
        } : null,
        difficulty: data1?.difficulty !== data2?.difficulty ? {
          from: data1?.difficulty,
          to: data2?.difficulty,
        } : null,
        problemsCount: {
          from: data1?.problems?.length || 0,
          to: data2?.problems?.length || 0,
        },
        // 추가적인 비교 로직은 필요에 따라 확장 가능
      },
      summary: {
        hasChanges: (
          data1?.title !== data2?.title ||
          data1?.description !== data2?.description ||
          data1?.difficulty !== data2?.difficulty ||
          (data1?.problems?.length || 0) !== (data2?.problems?.length || 0)
        ),
        compareDate: new Date().toISOString(),
      },
    };

    res.json(diff);

    logger.info(`Versions compared for problem set ${id}: ${version1.versionNumber} vs ${version2.versionNumber} by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error comparing problem set versions:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to compare problem set versions',
    });
  }
});

// 버전 삭제 (DELETE /problem-sets/:id/versions/:versionId)
router.delete('/:id/versions/:versionId', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id, versionId } = req.params;

    // 문제집 존재 확인 및 권한 체크
    const problemSet = await prisma.problemSet.findUnique({
      where: { id },
    });

    if (!problemSet) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem set not found',
      });
    }

    if (problemSet.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot delete versions for this problem set',
      });
    }

    // 버전 조회 및 현재 버전 체크
    const version = await prisma.problemSetVersion.findUnique({
      where: { 
        id: versionId,
        problemSetId: id,
      },
    });

    if (!version) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Version not found',
      });
    }

    if (version.isCurrent) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Cannot delete current version. Please set another version as current first.',
      });
    }

    // 버전 삭제 (소프트 삭제)
    await prisma.problemSetVersion.update({
      where: { id: versionId },
      data: { isActive: false },
    });

    res.status(204).send();

    logger.info(`Version ${versionId} deleted for problem set ${id} by user ${req.user?.userId}`, {
      versionNumber: version.versionNumber,
    });

  } catch (error) {
    logger.error('Error deleting problem set version:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete problem set version',
    });
  }
});

export default router;