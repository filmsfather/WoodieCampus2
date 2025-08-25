import type { Response } from 'express';
import { Router } from 'express';
import { PrismaClient } from "@prisma/client"
import { logger } from '../config/logger.js';
import { authenticateToken, requireAnyRole } from '../middleware/standard-auth.js';
import type { ApiRequest, QuestionType} from '../types/api.js';
import { UserRole, PaginatedResponse } from '../types/api.js';

const router = Router();
const prisma = new PrismaClient();

// 문제 목록 조회 (GET /problems)
router.get('/', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      categoryId,
      tagIds, // 쉼표로 구분된 태그 ID 목록
      difficulty,
      difficultyMin,
      difficultyMax,
      questionType,
      isPublic,
      problemSetId,
      createdBy,
      sortBy = 'created', // created, updated, title, difficulty
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // 검색 조건 구성
    const where: any = {
      isActive: true,
    };

    // Full-Text Search 지원
    if (search) {
      const searchTerms = (search as string).trim().split(/\s+/).join(' | ');
      where.OR = [
        { title: { search: searchTerms } },
        { description: { search: searchTerms } },
        { content: { search: searchTerms } }
      ];
    }

    if (categoryId) {
      where.categoryId = categoryId as string;
    }

    // 태그 필터링
    if (tagIds) {
      const tagIdList = (tagIds as string).split(',');
      where.problemTags = {
        some: {
          tagId: { in: tagIdList }
        }
      };
    }

    // 난이도 필터링 개선
    if (difficulty) {
      if (typeof difficulty === 'string' && difficulty.includes(',')) {
        // 다중 난이도 선택: "1,2,3"
        const difficultyList = (difficulty as string).split(',').map(d => parseInt(d));
        where.difficulty = { in: difficultyList };
      } else {
        // 단일 난이도
        where.difficulty = parseInt(difficulty as string);
      }
    } else if (difficultyMin || difficultyMax) {
      // 난이도 범위 검색
      where.difficulty = {};
      if (difficultyMin) where.difficulty.gte = parseInt(difficultyMin as string);
      if (difficultyMax) where.difficulty.lte = parseInt(difficultyMax as string);
    }

    // 작성자 필터
    if (createdBy) {
      where.createdById = createdBy as string;
    }

    if (questionType) {
      where.questionType = questionType as QuestionType;
    }

    if (isPublic !== undefined) {
      where.isPublic = isPublic === 'true';
    }

    if (problemSetId) {
      where.problemSetId = problemSetId as string;
    }

    // 권한 체크: 비공개 문제는 작성자나 관리자만 조회 가능
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
      const existingOR = where.OR || [];
      where.OR = [
        ...existingOR,
        { isPublic: true },
        { createdById: req.user?.userId }
      ];
    }

    // 정렬 옵션
    let orderBy: any = {};
    if (sortBy === 'title') {
      orderBy.title = sortOrder;
    } else if (sortBy === 'difficulty') {
      orderBy.difficulty = sortOrder;
    } else if (sortBy === 'updated') {
      orderBy.updatedAt = sortOrder;
    } else {
      // 기본값: created
      orderBy.createdAt = sortOrder;
    }

    const [problems, total] = await Promise.all([
      prisma.problem.findMany({
        where,
        orderBy,
        include: {
          choices: {
            orderBy: { order: 'asc' },
          },
          problemTags: {
            include: { tag: true },
          },
          category: true,
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          problemSet: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        skip,
        take: limitNum,
      }),
      prisma.problem.count({ where }),
    ]);

    res.json({
      problems,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });

    logger.info(`Problems fetched by user ${req.user?.userId}`, {
      count: problems.length,
      total,
      filters: { search, categoryId, difficulty, questionType, isPublic },
    });

  } catch (error) {
    logger.error('Error fetching problems:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch problems',
    });
  }
});

// 특정 문제 조회 (GET /problems/:id)
router.get('/:id', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { includeSolution = false } = req.query;

    const problem = await prisma.problem.findUnique({
      where: { id },
      include: {
        choices: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            text: true,
            order: true,
            isCorrect: includeSolution === 'true',
            feedback: includeSolution === 'true',
          },
        },
        problemTags: {
          include: { tag: true },
        },
        category: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        problemSet: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!problem) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem not found',
      });
    }

    // 권한 체크
    if (!problem.isPublic && 
        problem.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied to this problem',
      });
    }

    // 해답 및 해설 포함 여부 체크
    const response: any = { ...problem };
    if (includeSolution !== 'true' || 
        (problem.createdById !== req.user?.userId && 
         req.user?.role !== 'INSTRUCTOR' && 
         req.user?.role !== 'ADMIN' && 
         req.user?.role !== 'SUPER_ADMIN')) {
      delete response.solution;
      delete response.explanation;
    }

    res.json(response);

    logger.info(`Problem ${id} fetched by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error fetching problem:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch problem',
    });
  }
});

// 문제 생성 (POST /problems)
router.post('/', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const {
      title,
      description,
      content,
      questionType,
      solution,
      explanation,
      hints = [],
      difficulty = 1,
      estimatedTime,
      score = 1,
      isPublic = true,
      order = 0,
      attachments = [],
      metadata,
      problemSetId,
      categoryId,
      choices = [],
      tagIds = [],
    } = req.body;

    // 필수 필드 검증
    if (!title || !content || !problemSetId) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Title, content, and problemSetId are required',
      });
    }

    // 문제집 존재 확인 및 권한 체크
    const problemSet = await prisma.problemSet.findUnique({
      where: { id: problemSetId },
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
        message: 'Cannot add problems to this problem set',
      });
    }

    // 트랜잭션으로 문제 생성
    const problem = await prisma.$transaction(async (tx) => {
      // 문제 생성
      const newProblem = await tx.problem.create({
        data: {
          title,
          description,
          content,
          questionType,
          solution,
          explanation,
          hints,
          difficulty,
          estimatedTime,
          score,
          isPublic,
          order,
          attachments,
          metadata,
          problemSetId,
          categoryId,
          createdById: req.user!.userId,
        },
      });

      // 선택지 생성 (객관식, 참/거짓 등)
      if (choices.length > 0) {
        await tx.choice.createMany({
          data: choices.map((choice: any, index: number) => ({
            text: choice.text,
            isCorrect: choice.isCorrect || false,
            order: choice.order || index,
            feedback: choice.feedback,
            problemId: newProblem.id,
          })),
        });
      }

      // 태그 연결
      if (tagIds.length > 0) {
        await tx.problemTag.createMany({
          data: tagIds.map((tagId: string) => ({
            problemId: newProblem.id,
            tagId,
          })),
        });

        // 태그 사용 횟수 증가
        await tx.tag.updateMany({
          where: { id: { in: tagIds } },
          data: { usageCount: { increment: 1 } },
        });
      }

      return newProblem;
    });

    // 생성된 문제를 전체 정보와 함께 반환
    const createdProblem = await prisma.problem.findUnique({
      where: { id: problem.id },
      include: {
        choices: { orderBy: { order: 'asc' } },
        problemTags: { include: { tag: true } },
        category: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        problemSet: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    res.status(201).json(createdProblem);

    logger.info(`Problem created by user ${req.user?.userId}`, {
      problemId: problem.id,
      title,
      questionType,
      problemSetId,
    });

  } catch (error) {
    logger.error('Error creating problem:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create problem',
    });
  }
});

// 문제 수정 (PUT /problems/:id)
router.put('/:id', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      content,
      questionType,
      solution,
      explanation,
      hints,
      difficulty,
      estimatedTime,
      score,
      isPublic,
      order,
      attachments,
      metadata,
      categoryId,
      choices = [],
      tagIds = [],
    } = req.body;

    // 기존 문제 확인 및 권한 체크
    const existingProblem = await prisma.problem.findUnique({
      where: { id },
      include: {
        problemTags: true,
        choices: true,
      },
    });

    if (!existingProblem) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem not found',
      });
    }

    if (existingProblem.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot modify this problem',
      });
    }

    // 트랜잭션으로 문제 수정
    const updatedProblem = await prisma.$transaction(async (tx) => {
      // 문제 정보 수정
      const problem = await tx.problem.update({
        where: { id },
        data: {
          title,
          description,
          content,
          questionType,
          solution,
          explanation,
          hints,
          difficulty,
          estimatedTime,
          score,
          isPublic,
          order,
          attachments,
          metadata,
          categoryId,
        },
      });

      // 기존 선택지 삭제 후 새로 생성
      await tx.choice.deleteMany({
        where: { problemId: id },
      });

      if (choices.length > 0) {
        await tx.choice.createMany({
          data: choices.map((choice: any, index: number) => ({
            text: choice.text,
            isCorrect: choice.isCorrect || false,
            order: choice.order || index,
            feedback: choice.feedback,
            problemId: id,
          })),
        });
      }

      // 기존 태그 연결 해제
      const oldTagIds = existingProblem.problemTags.map(pt => pt.tagId);
      await tx.problemTag.deleteMany({
        where: { problemId: id },
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
        await tx.problemTag.createMany({
          data: tagIds.map((tagId: string) => ({
            problemId: id,
            tagId,
          })),
        });

        // 새 태그 사용 횟수 증가
        await tx.tag.updateMany({
          where: { id: { in: tagIds } },
          data: { usageCount: { increment: 1 } },
        });
      }

      return problem;
    });

    // 수정된 문제를 전체 정보와 함께 반환
    const result = await prisma.problem.findUnique({
      where: { id },
      include: {
        choices: { orderBy: { order: 'asc' } },
        problemTags: { include: { tag: true } },
        category: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        problemSet: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    res.json(result);

    logger.info(`Problem ${id} updated by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error updating problem:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update problem',
    });
  }
});

// 문제 삭제 (DELETE /problems/:id)
router.delete('/:id', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;

    // 기존 문제 확인 및 권한 체크
    const existingProblem = await prisma.problem.findUnique({
      where: { id },
      include: {
        problemTags: true,
      },
    });

    if (!existingProblem) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem not found',
      });
    }

    if (existingProblem.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot delete this problem',
      });
    }

    // 트랜잭션으로 문제 삭제
    await prisma.$transaction(async (tx) => {
      // 태그 사용 횟수 감소
      const tagIds = existingProblem.problemTags.map(pt => pt.tagId);
      if (tagIds.length > 0) {
        await tx.tag.updateMany({
          where: { id: { in: tagIds } },
          data: { usageCount: { decrement: 1 } },
        });
      }

      // 문제 삭제 (연관된 선택지, 태그 연결 등은 CASCADE로 자동 삭제)
      await tx.problem.delete({
        where: { id },
      });
    });

    res.status(204).send();

    logger.info(`Problem ${id} deleted by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error deleting problem:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete problem',
    });
  }
});

// 문제 순서 변경 (PATCH /problems/:id/order)
router.patch('/:id/order', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { order } = req.body;

    if (typeof order !== 'number') {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Order must be a number',
      });
    }

    // 기존 문제 확인 및 권한 체크
    const existingProblem = await prisma.problem.findUnique({
      where: { id },
    });

    if (!existingProblem) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem not found',
      });
    }

    if (existingProblem.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot modify this problem',
      });
    }

    // 순서 업데이트
    const updatedProblem = await prisma.problem.update({
      where: { id },
      data: { order },
    });

    res.json(updatedProblem);

    logger.info(`Problem ${id} order updated to ${order} by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error updating problem order:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update problem order',
    });
  }
});

export default router;