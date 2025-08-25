import type { Response } from 'express';
import { Router } from 'express';
import { PrismaClient } from "@prisma/client"
import { logger } from '../config/logger.js';
import { authenticateToken, requireAnyRole } from '../middleware/standard-auth.js';
import type { ApiRequest } from '../types/api.js';
import { cacheUtils } from '../config/redis.js';

const router = Router();
const prisma = new PrismaClient();

// 문제집 빌더 세션 생성 (POST /problem-set-builder/sessions)
router.post('/sessions', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const {
      title = 'New Problem Set',
      description,
      categoryId,
      difficulty = 1,
      timeLimit,
      totalScore = 100,
      passScore = 60,
      instructions
    } = req.body;

    // 임시 문제집 빌더 세션을 Redis에 저장
    const sessionId = `builder_${Date.now()}_${req.user!.userId}`;
    
    const builderSession = {
      sessionId,
      userId: req.user!.userId,
      metadata: {
        title,
        description,
        categoryId,
        difficulty,
        timeLimit,
        totalScore,
        passScore,
        instructions
      },
      problems: [], // 선택된 문제들
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      isDraft: true
    };

    // Redis에 24시간 동안 저장
    await cacheUtils.set(`builder_session:${sessionId}`, builderSession, 24 * 60 * 60);

    // 사용자 세션 목록에 추가
    const userSessionsKey = `user_builder_sessions:${req.user!.userId}`;
    const existingSessions = await cacheUtils.get(userSessionsKey) || [];
    existingSessions.unshift(sessionId); // 최신 세션을 앞에 추가
    await cacheUtils.set(userSessionsKey, existingSessions.slice(0, 10), 24 * 60 * 60); // 최대 10개만 유지

    res.status(201).json(builderSession);

    logger.info(`Problem set builder session created: ${sessionId} by user ${req.user?.userId}`);

  } catch (error) {
    logger.error('Error creating builder session:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create builder session',
      timestamp: new Date().toISOString()
    });
  }
});

// 빌더 세션 조회 (GET /problem-set-builder/sessions/:sessionId)
router.get('/sessions/:sessionId', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await cacheUtils.get(`builder_session:${sessionId}`);

    if (!session) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Builder session not found or expired',
        timestamp: new Date().toISOString()
      });
    }

    // 권한 체크: 세션 소유자만 접근 가능
    if (session.userId !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot access this builder session',
        timestamp: new Date().toISOString()
      });
    }

    res.json(session);

  } catch (error) {
    logger.error('Error fetching builder session:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch builder session',
      timestamp: new Date().toISOString()
    });
  }
});

// 문제집 메타데이터 업데이트 (PUT /problem-set-builder/sessions/:sessionId/metadata)
router.put('/sessions/:sessionId/metadata', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const updateData = req.body;

    const session = await cacheUtils.get(`builder_session:${sessionId}`);

    if (!session) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Builder session not found',
        timestamp: new Date().toISOString()
      });
    }

    // 권한 체크
    if (session.userId !== req.user?.userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot modify this builder session',
        timestamp: new Date().toISOString()
      });
    }

    // 메타데이터 업데이트
    const updatedSession = {
      ...session,
      metadata: {
        ...session.metadata,
        ...updateData
      },
      lastModified: new Date().toISOString()
    };

    await cacheUtils.set(`builder_session:${sessionId}`, updatedSession, 24 * 60 * 60);

    res.json(updatedSession);

    logger.info(`Builder session metadata updated: ${sessionId}`);

  } catch (error) {
    logger.error('Error updating builder session metadata:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update session metadata',
      timestamp: new Date().toISOString()
    });
  }
});

// 문제집에 문제 추가 (POST /problem-set-builder/sessions/:sessionId/problems)
router.post('/sessions/:sessionId/problems', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { problemIds, insertIndex = -1 } = req.body; // problemIds는 배열

    const session = await cacheUtils.get(`builder_session:${sessionId}`);

    if (!session) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Builder session not found',
        timestamp: new Date().toISOString()
      });
    }

    // 권한 체크
    if (session.userId !== req.user?.userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot modify this builder session',
        timestamp: new Date().toISOString()
      });
    }

    // 문제 정보 조회
    const problems = await prisma.problem.findMany({
      where: {
        id: { in: problemIds },
        isActive: true,
        OR: [
          { isPublic: true },
          { createdById: req.user!.userId }
        ]
      },
      select: {
        id: true,
        title: true,
        difficulty: true,
        questionType: true,
        estimatedTime: true,
        category: {
          select: { name: true }
        },
        problemTags: {
          include: {
            tag: {
              select: { name: true, color: true }
            }
          }
        }
      }
    });

    // 새로운 문제 아이템 생성
    const newProblemItems = problems.map((problem, index) => ({
      id: `item_${Date.now()}_${index}`,
      problemId: problem.id,
      order: session.problems.length + index,
      weight: 1.0, // 기본 가중치
      customScore: 10, // 커스텀 점수 (기본값)
      isRequired: true, // 필수 문제 여부
      problem: problem
    }));

    // 문제 목록에 추가
    let updatedProblems = [...session.problems];
    
    if (insertIndex >= 0 && insertIndex < updatedProblems.length) {
      // 특정 위치에 삽입
      updatedProblems.splice(insertIndex, 0, ...newProblemItems);
    } else {
      // 마지막에 추가
      updatedProblems.push(...newProblemItems);
    }

    // order 재정렬
    updatedProblems = updatedProblems.map((item, index) => ({
      ...item,
      order: index
    }));

    const updatedSession = {
      ...session,
      problems: updatedProblems,
      lastModified: new Date().toISOString()
    };

    await cacheUtils.set(`builder_session:${sessionId}`, updatedSession, 24 * 60 * 60);

    res.json({
      addedProblems: newProblemItems,
      totalProblems: updatedProblems.length,
      session: updatedSession
    });

    logger.info(`Problems added to builder session: ${sessionId}`, {
      problemCount: newProblemItems.length
    });

  } catch (error) {
    logger.error('Error adding problems to builder session:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to add problems',
      timestamp: new Date().toISOString()
    });
  }
});

// 문제집에서 문제 제거 (DELETE /problem-set-builder/sessions/:sessionId/problems/:itemId)
router.delete('/sessions/:sessionId/problems/:itemId', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { sessionId, itemId } = req.params;

    const session = await cacheUtils.get(`builder_session:${sessionId}`);

    if (!session) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Builder session not found',
        timestamp: new Date().toISOString()
      });
    }

    // 권한 체크
    if (session.userId !== req.user?.userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot modify this builder session',
        timestamp: new Date().toISOString()
      });
    }

    // 문제 제거
    const updatedProblems = session.problems
      .filter((item: any) => item.id !== itemId)
      .map((item: any, index: number) => ({
        ...item,
        order: index // order 재정렬
      }));

    const updatedSession = {
      ...session,
      problems: updatedProblems,
      lastModified: new Date().toISOString()
    };

    await cacheUtils.set(`builder_session:${sessionId}`, updatedSession, 24 * 60 * 60);

    res.json({
      removedItemId: itemId,
      totalProblems: updatedProblems.length,
      session: updatedSession
    });

    logger.info(`Problem removed from builder session: ${sessionId}`, { itemId });

  } catch (error) {
    logger.error('Error removing problem from builder session:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to remove problem',
      timestamp: new Date().toISOString()
    });
  }
});

// 문제 순서 변경 (PUT /problem-set-builder/sessions/:sessionId/problems/reorder)
router.put('/sessions/:sessionId/problems/reorder', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { itemId, newIndex } = req.body;

    const session = await cacheUtils.get(`builder_session:${sessionId}`);

    if (!session) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Builder session not found',
        timestamp: new Date().toISOString()
      });
    }

    // 권한 체크
    if (session.userId !== req.user?.userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot modify this builder session',
        timestamp: new Date().toISOString()
      });
    }

    const problems = [...session.problems];
    const currentIndex = problems.findIndex((item: any) => item.id === itemId);

    if (currentIndex === -1) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Problem item not found in session',
        timestamp: new Date().toISOString()
      });
    }

    // 드래그앤드롭 순서 변경
    const [movedItem] = problems.splice(currentIndex, 1);
    problems.splice(newIndex, 0, movedItem);

    // order 필드 업데이트
    const reorderedProblems = problems.map((item: any, index: number) => ({
      ...item,
      order: index
    }));

    const updatedSession = {
      ...session,
      problems: reorderedProblems,
      lastModified: new Date().toISOString()
    };

    await cacheUtils.set(`builder_session:${sessionId}`, updatedSession, 24 * 60 * 60);

    res.json({
      reorderedProblems,
      movedItem: { ...movedItem, order: newIndex },
      session: updatedSession
    });

    logger.info(`Problem reordered in builder session: ${sessionId}`, {
      itemId,
      from: currentIndex,
      to: newIndex
    });

  } catch (error) {
    logger.error('Error reordering problems in builder session:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to reorder problems',
      timestamp: new Date().toISOString()
    });
  }
});

// 문제별 설정 업데이트 (PUT /problem-set-builder/sessions/:sessionId/problems/:itemId/settings)
router.put('/sessions/:sessionId/problems/:itemId/settings', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { sessionId, itemId } = req.params;
    const { weight, customScore, isRequired } = req.body;

    const session = await cacheUtils.get(`builder_session:${sessionId}`);

    if (!session) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Builder session not found',
        timestamp: new Date().toISOString()
      });
    }

    // 권한 체크
    if (session.userId !== req.user?.userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot modify this builder session',
        timestamp: new Date().toISOString()
      });
    }

    // 문제 설정 업데이트
    const updatedProblems = session.problems.map((item: any) => {
      if (item.id === itemId) {
        return {
          ...item,
          weight: weight !== undefined ? weight : item.weight,
          customScore: customScore !== undefined ? customScore : item.customScore,
          isRequired: isRequired !== undefined ? isRequired : item.isRequired
        };
      }
      return item;
    });

    const updatedSession = {
      ...session,
      problems: updatedProblems,
      lastModified: new Date().toISOString()
    };

    await cacheUtils.set(`builder_session:${sessionId}`, updatedSession, 24 * 60 * 60);

    const updatedItem = updatedProblems.find((item: any) => item.id === itemId);

    res.json({
      updatedItem,
      session: updatedSession
    });

    logger.info(`Problem settings updated in builder session: ${sessionId}`, {
      itemId,
      settings: { weight, customScore, isRequired }
    });

  } catch (error) {
    logger.error('Error updating problem settings:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update problem settings',
      timestamp: new Date().toISOString()
    });
  }
});

// 문제집 빌더에서 실제 문제집으로 저장 (POST /problem-set-builder/sessions/:sessionId/save)
router.post('/sessions/:sessionId/save', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { publishImmediately = false } = req.body;

    const session = await cacheUtils.get(`builder_session:${sessionId}`);

    if (!session) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Builder session not found',
        timestamp: new Date().toISOString()
      });
    }

    // 권한 체크
    if (session.userId !== req.user?.userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot save this builder session',
        timestamp: new Date().toISOString()
      });
    }

    if (session.problems.length === 0) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Cannot save empty problem set',
        timestamp: new Date().toISOString()
      });
    }

    // 총점 계산
    const calculatedTotalScore = session.problems.reduce((sum: number, item: any) => 
      sum + (item.customScore * item.weight), 0
    );

    // 트랜잭션으로 문제집 생성
    const problemSet = await prisma.$transaction(async (tx) => {
      // 문제집 생성
      const newProblemSet = await tx.problemSet.create({
        data: {
          title: session.metadata.title,
          description: session.metadata.description,
          difficulty: session.metadata.difficulty,
          categoryId: session.metadata.categoryId,
          timeLimit: session.metadata.timeLimit,
          totalScore: calculatedTotalScore,
          passScore: session.metadata.passScore,
          instructions: session.metadata.instructions,
          isPublic: publishImmediately,
          createdById: req.user!.userId
        }
      });

      // 문제들을 문제집에 연결
      for (const item of session.problems) {
        await tx.problem.update({
          where: { id: item.problemId },
          data: {
            problemSetId: newProblemSet.id,
            order: item.order
          }
        });
      }

      return newProblemSet;
    });

    // 세션 삭제
    await cacheUtils.del(`builder_session:${sessionId}`);

    // 생성된 문제집 상세 정보 조회
    const createdProblemSet = await prisma.problemSet.findUnique({
      where: { id: problemSet.id },
      include: {
        category: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        problems: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            title: true,
            difficulty: true,
            questionType: true,
            order: true
          }
        },
        _count: {
          select: { problems: true }
        }
      }
    });

    res.status(201).json(createdProblemSet);

    logger.info(`Problem set created from builder session: ${sessionId}`, {
      problemSetId: problemSet.id,
      problemCount: session.problems.length,
      totalScore: calculatedTotalScore
    });

  } catch (error) {
    logger.error('Error saving problem set from builder session:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to save problem set',
      timestamp: new Date().toISOString()
    });
  }
});

// 빌더 세션 삭제 (DELETE /problem-set-builder/sessions/:sessionId)
router.delete('/sessions/:sessionId', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await cacheUtils.get(`builder_session:${sessionId}`);

    if (!session) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Builder session not found',
        timestamp: new Date().toISOString()
      });
    }

    // 권한 체크
    if (session.userId !== req.user?.userId && 
        req.user?.role !== 'ADMIN' && 
        req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot delete this builder session',
        timestamp: new Date().toISOString()
      });
    }

    await cacheUtils.del(`builder_session:${sessionId}`);

    // 사용자 세션 목록에서도 제거
    const userSessionsKey = `user_builder_sessions:${session.userId}`;
    const existingSessions = await cacheUtils.get(userSessionsKey) || [];
    const updatedSessions = existingSessions.filter((id: string) => id !== sessionId);
    await cacheUtils.set(userSessionsKey, updatedSessions, 24 * 60 * 60);

    res.status(204).send();

    logger.info(`Builder session deleted: ${sessionId}`);

  } catch (error) {
    logger.error('Error deleting builder session:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete builder session',
      timestamp: new Date().toISOString()
    });
  }
});

// 사용자의 빌더 세션 목록 조회 (GET /problem-set-builder/sessions)
router.get('/sessions', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    // 사용자별 세션 목록을 별도 키에 저장해서 관리
    const userSessionsKey = `user_builder_sessions:${req.user!.userId}`;
    const sessionsList = await cacheUtils.get(userSessionsKey) || [];

    const sessions = [];
    for (const sessionId of sessionsList) {
      const session = await cacheUtils.get(`builder_session:${sessionId}`);
      if (session) {
        sessions.push({
          sessionId: session.sessionId,
          title: session.metadata.title,
          problemCount: session.problems.length,
          createdAt: session.createdAt,
          lastModified: session.lastModified,
          isDraft: session.isDraft
        });
      }
    }

    // 최근 수정일 순으로 정렬
    sessions.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    res.json({ sessions });

  } catch (error) {
    logger.error('Error fetching builder sessions:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch builder sessions',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;