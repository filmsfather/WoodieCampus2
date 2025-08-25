import type { Response } from 'express';
import { Router } from 'express';
import { PrismaClient } from "@prisma/client"
import { logger } from '../config/logger.js';
import { authenticateToken, requireAnyRole } from '../middleware/standard-auth.js';
import type { ApiRequest, QuestionType } from '../types/api.js';
import { cacheUtils } from '../config/redis.js';

const router = Router();
const prisma = new PrismaClient();

// 드래프트 키 생성 함수
function getDraftKey(userId: string, type: 'problem' | 'problem-set', id?: string): string {
  const identifier = id || 'new';
  return `draft:${type}:${identifier}:${userId}`;
}

// 문제 드래프트 저장 (POST /problem-drafts/save)
router.post('/save', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const {
      problemId,
      problemSetId,
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
      categoryId,
      choices = [],
      tagIds = [],
      metadata,
      autoSave = true,
    } = req.body;

    if (!problemSetId) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Problem set ID is required',
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
        message: 'Cannot save draft for this problem set',
      });
    }

    // 기존 문제 수정인지 확인
    if (problemId) {
      const existingProblem = await prisma.problem.findUnique({
        where: { id: problemId },
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
    }

    // 드래프트 데이터 구성
    const draftData = {
      problemId,
      problemSetId,
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
      categoryId,
      choices,
      tagIds,
      metadata,
      userId: req.user!.userId,
      savedAt: new Date().toISOString(),
      isAutoSave: autoSave,
    };

    // 드래프트 키 생성
    const draftKey = getDraftKey(req.user!.userId, 'problem', problemId);

    // Redis에 저장 (24시간 TTL)
    const saved = await cacheUtils.set(draftKey, draftData, 24 * 60 * 60);

    if (saved) {
      res.json({
        success: true,
        draftKey,
        savedAt: draftData.savedAt,
        isAutoSave: autoSave,
      });

      if (!autoSave) {
        logger.info(`Problem draft saved manually by user ${req.user?.userId}`, {
          problemId,
          problemSetId,
          draftKey,
        });
      }
    } else {
      res.status(503).json({
        error: 'Service unavailable',
        message: 'Failed to save draft',
      });
    }

  } catch (error) {
    logger.error('Error saving problem draft:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to save problem draft',
    });
  }
});

// 문제 드래프트 조회 (GET /problem-drafts/:problemId?)
router.get('/:problemId?', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { problemId } = req.params;
    
    // 드래프트 키 생성
    const draftKey = getDraftKey(req.user!.userId, 'problem', problemId);

    // Redis에서 드래프트 조회
    const draftData = await cacheUtils.get(draftKey);

    if (draftData) {
      res.json({
        found: true,
        draft: draftData,
        draftKey,
      });
    } else {
      res.json({
        found: false,
        draft: null,
        draftKey,
      });
    }

  } catch (error) {
    logger.error('Error retrieving problem draft:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve problem draft',
    });
  }
});

// 사용자의 모든 문제 드래프트 목록 조회 (GET /problem-drafts)
router.get('/', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    // Redis에서 사용자의 모든 드래프트 키 조회
    const pattern = `draft:problem:*:${req.user!.userId}`;
    
    // 실제 환경에서는 Redis SCAN이나 별도 인덱스 사용
    // 여기서는 기본적인 응답 구조만 제공
    const drafts: any[] = [];

    res.json({
      drafts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: drafts.length,
        totalPages: Math.ceil(drafts.length / limitNum),
      },
      message: 'Draft listing requires Redis SCAN implementation',
    });

  } catch (error) {
    logger.error('Error fetching problem drafts:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch problem drafts',
    });
  }
});

// 문제 드래프트 삭제 (DELETE /problem-drafts/:problemId?)
router.delete('/:problemId?', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { problemId } = req.params;
    
    // 드래프트 키 생성
    const draftKey = getDraftKey(req.user!.userId, 'problem', problemId);

    // Redis에서 드래프트 삭제
    const deleted = await cacheUtils.del(draftKey);

    if (deleted) {
      res.status(204).send();
      
      logger.info(`Problem draft deleted by user ${req.user?.userId}`, {
        problemId,
        draftKey,
      });
    } else {
      res.status(404).json({
        error: 'Not found',
        message: 'Draft not found',
      });
    }

  } catch (error) {
    logger.error('Error deleting problem draft:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete problem draft',
    });
  }
});

// 드래프트를 실제 문제로 발행 (POST /problem-drafts/:problemId?/publish)
router.post('/:problemId?/publish', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { problemId } = req.params;
    
    // 드래프트 키 생성
    const draftKey = getDraftKey(req.user!.userId, 'problem', problemId);

    // Redis에서 드래프트 조회
    const draftData = await cacheUtils.get(draftKey);

    if (!draftData) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Draft not found',
      });
    }

    const {
      problemSetId,
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
      categoryId,
      choices,
      tagIds,
      metadata,
    } = draftData;

    // 필수 필드 검증
    if (!title || !content || !problemSetId) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Title, content, and problemSetId are required',
      });
    }

    // 트랜잭션으로 문제 생성/수정
    const result = await prisma.$transaction(async (tx) => {
      let problem;

      if (problemId) {
        // 기존 문제 수정
        problem = await tx.problem.update({
          where: { id: problemId },
          data: {
            title,
            description,
            content,
            questionType,
            solution,
            explanation,
            hints: hints || [],
            difficulty: difficulty || 1,
            estimatedTime,
            score: score || 1,
            isPublic: isPublic !== false,
            categoryId,
            metadata: metadata as any,
          },
        });

        // 기존 선택지 삭제 후 새로 생성
        await tx.choice.deleteMany({
          where: { problemId },
        });

        // 기존 태그 연결 해제
        await tx.problemTag.deleteMany({
          where: { problemId },
        });
      } else {
        // 새 문제 생성
        problem = await tx.problem.create({
          data: {
            title,
            description,
            content,
            questionType,
            solution,
            explanation,
            hints: hints || [],
            difficulty: difficulty || 1,
            estimatedTime,
            score: score || 1,
            isPublic: isPublic !== false,
            order: 0,
            attachments: [],
            metadata: metadata as any,
            problemSetId,
            categoryId,
            createdById: req.user!.userId,
          },
        });
      }

      // 선택지 생성
      if (choices && choices.length > 0) {
        await tx.choice.createMany({
          data: choices.map((choice: any, index: number) => ({
            text: choice.text,
            isCorrect: choice.isCorrect || false,
            order: choice.order !== undefined ? choice.order : index,
            feedback: choice.feedback,
            problemId: problem.id,
          })),
        });
      }

      // 태그 연결
      if (tagIds && tagIds.length > 0) {
        await tx.problemTag.createMany({
          data: tagIds.map((tagId: string) => ({
            problemId: problem.id,
            tagId,
          })),
        });

        // 태그 사용 횟수 증가
        await tx.tag.updateMany({
          where: { id: { in: tagIds } },
          data: { usageCount: { increment: 1 } },
        });
      }

      return problem;
    });

    // 드래프트 삭제
    await cacheUtils.del(draftKey);

    // 발행된 문제를 전체 정보와 함께 반환
    const publishedProblem = await prisma.problem.findUnique({
      where: { id: result.id },
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

    res.status(201).json({
      problem: publishedProblem,
      publishedFromDraft: true,
    });

    logger.info(`Problem published from draft by user ${req.user?.userId}`, {
      problemId: result.id,
      wasUpdate: !!problemId,
      draftKey,
    });

  } catch (error) {
    logger.error('Error publishing problem from draft:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to publish problem from draft',
    });
  }
});

// 드래프트 비교 (POST /problem-drafts/:problemId/compare)
router.post('/:problemId/compare', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { problemId } = req.params;

    // 현재 문제 조회
    const currentProblem = await prisma.problem.findUnique({
      where: { id: problemId },
      include: {
        choices: { orderBy: { order: 'asc' } },
        problemTags: { include: { tag: true } },
      },
    });

    if (!currentProblem) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem not found',
      });
    }

    // 권한 체크
    if (currentProblem.createdById !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot compare this problem',
      });
    }

    // 드래프트 조회
    const draftKey = getDraftKey(req.user!.userId, 'problem', problemId);
    const draftData = await cacheUtils.get(draftKey);

    if (!draftData) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Draft not found',
      });
    }

    // 간단한 변경사항 비교
    const changes: any = {};

    if (currentProblem.title !== draftData.title) {
      changes.title = {
        current: currentProblem.title,
        draft: draftData.title,
      };
    }

    if (currentProblem.content !== draftData.content) {
      changes.content = {
        current: currentProblem.content,
        draft: draftData.content,
      };
    }

    if (currentProblem.difficulty !== draftData.difficulty) {
      changes.difficulty = {
        current: currentProblem.difficulty,
        draft: draftData.difficulty,
      };
    }

    if (currentProblem.score !== draftData.score) {
      changes.score = {
        current: currentProblem.score,
        draft: draftData.score,
      };
    }

    if (currentProblem.choices.length !== (draftData.choices || []).length) {
      changes.choicesCount = {
        current: currentProblem.choices.length,
        draft: (draftData.choices || []).length,
      };
    }

    const hasChanges = Object.keys(changes).length > 0;

    res.json({
      hasChanges,
      changes,
      currentProblem: {
        id: currentProblem.id,
        title: currentProblem.title,
        updatedAt: currentProblem.updatedAt,
      },
      draft: {
        savedAt: draftData.savedAt,
        isAutoSave: draftData.isAutoSave,
      },
      summary: {
        fieldsChanged: Object.keys(changes).length,
        comparedAt: new Date().toISOString(),
      },
    });

  } catch (error) {
    logger.error('Error comparing problem draft:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to compare problem draft',
    });
  }
});

export default router;