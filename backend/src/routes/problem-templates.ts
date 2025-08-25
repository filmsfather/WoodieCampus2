import type { Response } from 'express';
import { Router } from 'express';
import { PrismaClient } from "@prisma/client"
import { logger } from '../config/logger.js';
import { authenticateToken, requireAnyRole } from '../middleware/standard-auth.js';
import type { ApiRequest, QuestionType } from '../types/api.js';
import { cacheUtils } from '../config/redis.js';

const router = Router();
const prisma = new PrismaClient();

// 기본 문제 템플릿 데이터
const DEFAULT_TEMPLATES = {
  MULTIPLE_CHOICE: {
    title: "객관식 문제",
    description: "4지선다 객관식 문제 템플릿",
    structure: {
      questionType: "MULTIPLE_CHOICE",
      content: "<p>문제 내용을 입력하세요.</p>",
      choices: [
        { text: "선택지 1", isCorrect: false, order: 0 },
        { text: "선택지 2", isCorrect: false, order: 1 },
        { text: "선택지 3", isCorrect: true, order: 2 },
        { text: "선택지 4", isCorrect: false, order: 3 },
      ],
      solution: "정답: 3번",
      explanation: "해설을 입력하세요.",
      hints: ["힌트 1을 입력하세요."],
      difficulty: 1,
      score: 1,
    },
  },
  TRUE_FALSE: {
    title: "참/거짓 문제",
    description: "참/거짓(O/X) 문제 템플릿",
    structure: {
      questionType: "TRUE_FALSE",
      content: "<p>참/거짓을 판단할 문장을 입력하세요.</p>",
      choices: [
        { text: "참 (O)", isCorrect: true, order: 0 },
        { text: "거짓 (X)", isCorrect: false, order: 1 },
      ],
      solution: "정답: 참",
      explanation: "해설을 입력하세요.",
      hints: ["힌트를 입력하세요."],
      difficulty: 1,
      score: 1,
    },
  },
  SHORT_ANSWER: {
    title: "단답형 문제",
    description: "짧은 답변을 요구하는 문제 템플릿",
    structure: {
      questionType: "SHORT_ANSWER",
      content: "<p>단답형 문제 내용을 입력하세요.</p>",
      choices: [],
      solution: "모범 답안을 입력하세요.",
      explanation: "해설을 입력하세요.",
      hints: ["힌트를 입력하세요."],
      difficulty: 1,
      score: 1,
    },
  },
  ESSAY: {
    title: "서술형 문제",
    description: "긴 서술식 답변을 요구하는 문제 템플릿",
    structure: {
      questionType: "ESSAY",
      content: "<p>서술형 문제 내용을 입력하세요.</p>",
      choices: [],
      solution: "모범 답안을 입력하세요.",
      explanation: "채점 기준 및 해설을 입력하세요.",
      hints: ["힌트를 입력하세요."],
      difficulty: 2,
      score: 3,
    },
  },
  FILL_IN_BLANK: {
    title: "빈칸 채우기 문제",
    description: "빈칸을 채우는 문제 템플릿",
    structure: {
      questionType: "FILL_IN_BLANK",
      content: "<p>다음 문장에서 빈칸에 들어갈 적절한 단어를 입력하세요.</p><p>안녕하세요. _____ 입니다.</p>",
      choices: [],
      solution: "정답: [사용자명/이름]",
      explanation: "해설을 입력하세요.",
      hints: ["힌트를 입력하세요."],
      difficulty: 1,
      score: 2,
    },
  },
  MATCHING: {
    title: "연결형 문제",
    description: "두 그룹을 연결하는 문제 템플릿",
    structure: {
      questionType: "MATCHING",
      content: "<p>다음을 올바르게 연결하세요.</p>",
      choices: [
        { text: "A그룹 1 - B그룹 가", isCorrect: true, order: 0 },
        { text: "A그룹 2 - B그룹 나", isCorrect: true, order: 1 },
        { text: "A그룹 3 - B그룹 다", isCorrect: true, order: 2 },
      ],
      solution: "1-가, 2-나, 3-다",
      explanation: "연결 근거를 설명하세요.",
      hints: ["연결 힌트를 입력하세요."],
      difficulty: 2,
      score: 3,
    },
  },
  ORDERING: {
    title: "순서 배치 문제",
    description: "순서를 맞추는 문제 템플릿",
    structure: {
      questionType: "ORDERING",
      content: "<p>다음 항목들을 올바른 순서로 배치하세요.</p>",
      choices: [
        { text: "첫 번째 단계", isCorrect: true, order: 0 },
        { text: "두 번째 단계", isCorrect: true, order: 1 },
        { text: "세 번째 단계", isCorrect: true, order: 2 },
        { text: "네 번째 단계", isCorrect: true, order: 3 },
      ],
      solution: "정답 순서: 1 → 2 → 3 → 4",
      explanation: "순서의 근거를 설명하세요.",
      hints: ["순서 힌트를 입력하세요."],
      difficulty: 2,
      score: 3,
    },
  },
  CODING: {
    title: "코딩 문제",
    description: "프로그래밍 문제 템플릿",
    structure: {
      questionType: "CODING",
      content: `<p>다음 조건에 맞는 함수를 작성하세요.</p>
        <h4>문제 설명</h4>
        <p>문제 설명을 입력하세요.</p>
        <h4>입력</h4>
        <p>입력 형식을 설명하세요.</p>
        <h4>출력</h4>
        <p>출력 형식을 설명하세요.</p>
        <h4>예시</h4>
        <pre><code>입력: 예시 입력
출력: 예시 출력</code></pre>`,
      choices: [],
      solution: `// 모범 답안 코드
function solution() {
  // 구현
}`,
      explanation: "코드 설명 및 시간복잡도 분석",
      hints: ["알고리즘 힌트를 입력하세요."],
      difficulty: 3,
      score: 5,
      metadata: {
        language: "javascript",
        timeLimit: 1000,
        memoryLimit: 256,
      },
    },
  },
};

// 사용자 정의 템플릿 CRUD

// 템플릿 목록 조회 (GET /problem-templates)
router.get('/', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      questionType,
      isPublic,
      search,
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // 기본 템플릿들
    const defaultTemplates = Object.entries(DEFAULT_TEMPLATES).map(([key, template], index) => ({
      id: `default-${key.toLowerCase()}`,
      title: template.title,
      description: template.description,
      questionType: key as QuestionType,
      isDefault: true,
      isPublic: true,
      structure: template.structure,
      createdBy: {
        id: 'system',
        firstName: 'System',
        lastName: 'Default',
        email: 'system@woodiecampus.com',
      },
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      usageCount: 0,
    }));

    // 필터링
    let filteredDefaultTemplates = defaultTemplates;
    if (questionType) {
      filteredDefaultTemplates = defaultTemplates.filter(t => t.questionType === questionType);
    }
    if (search) {
      const searchTerm = (search as string).toLowerCase();
      filteredDefaultTemplates = filteredDefaultTemplates.filter(t => 
        t.title.toLowerCase().includes(searchTerm) ||
        t.description.toLowerCase().includes(searchTerm)
      );
    }

    // 사용자 정의 템플릿 조회 (실제 환경에서는 별도 테이블 생성)
    const customTemplates: any[] = [];

    const allTemplates = [...filteredDefaultTemplates, ...customTemplates];
    
    // 페이지네이션
    const total = allTemplates.length;
    const templates = allTemplates.slice(skip, skip + limitNum);

    res.json({
      templates,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });

    logger.info(`Problem templates fetched by user ${req.user?.userId}`, {
      count: templates.length,
      questionType,
      search,
    });

  } catch (error) {
    logger.error('Error fetching problem templates:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch problem templates',
    });
  }
});

// 특정 템플릿 조회 (GET /problem-templates/:id)
router.get('/:id', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;

    // 기본 템플릿 체크
    if (id.startsWith('default-')) {
      const templateKey = id.replace('default-', '').toUpperCase() as keyof typeof DEFAULT_TEMPLATES;
      const defaultTemplate = DEFAULT_TEMPLATES[templateKey];
      
      if (defaultTemplate) {
        const template = {
          id,
          title: defaultTemplate.title,
          description: defaultTemplate.description,
          questionType: templateKey as QuestionType,
          isDefault: true,
          isPublic: true,
          structure: defaultTemplate.structure,
          createdBy: {
            id: 'system',
            firstName: 'System',
            lastName: 'Default',
            email: 'system@woodiecampus.com',
          },
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          usageCount: 0,
        };

        return res.json(template);
      }
    }

    // 사용자 정의 템플릿 조회 (실제 구현 시)
    return res.status(404).json({
      error: 'Not found',
      message: 'Template not found',
    });

  } catch (error) {
    logger.error('Error fetching problem template:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch problem template',
    });
  }
});

// 템플릿에서 문제 생성 (POST /problem-templates/:id/create-problem)
router.post('/:id/create-problem', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      problemSetId,
      customizations = {},
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
        message: 'Cannot add problems to this problem set',
      });
    }

    // 템플릿 조회
    let templateStructure: any = null;

    if (id.startsWith('default-')) {
      const templateKey = id.replace('default-', '').toUpperCase() as keyof typeof DEFAULT_TEMPLATES;
      const defaultTemplate = DEFAULT_TEMPLATES[templateKey];
      
      if (defaultTemplate) {
        templateStructure = defaultTemplate.structure;
      }
    }

    if (!templateStructure) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Template not found',
      });
    }

    // 커스터마이제이션 적용
    const problemData = {
      ...templateStructure,
      ...customizations,
      title: customizations.title || `새 ${templateStructure.questionType} 문제`,
      description: customizations.description || '',
      problemSetId,
      createdById: req.user!.userId,
    };

    // 트랜잭션으로 문제 생성
    const problem = await prisma.$transaction(async (tx) => {
      // 문제 생성
      const newProblem = await tx.problem.create({
        data: {
          title: problemData.title,
          description: problemData.description,
          content: problemData.content,
          questionType: problemData.questionType,
          solution: problemData.solution,
          explanation: problemData.explanation,
          hints: problemData.hints || [],
          difficulty: problemData.difficulty || 1,
          estimatedTime: problemData.estimatedTime,
          score: problemData.score || 1,
          isPublic: problemData.isPublic !== false,
          order: problemData.order || 0,
          attachments: problemData.attachments || [],
          metadata: problemData.metadata as any,
          problemSetId,
          categoryId: problemData.categoryId,
          createdById: req.user!.userId,
        },
      });

      // 선택지 생성
      if (problemData.choices && problemData.choices.length > 0) {
        await tx.choice.createMany({
          data: problemData.choices.map((choice: any, index: number) => ({
            text: choice.text,
            isCorrect: choice.isCorrect || false,
            order: choice.order !== undefined ? choice.order : index,
            feedback: choice.feedback,
            problemId: newProblem.id,
          })),
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

    res.status(201).json({
      problem: createdProblem,
      templateUsed: {
        id,
        questionType: templateStructure.questionType,
      },
    });

    logger.info(`Problem created from template ${id} by user ${req.user?.userId}`, {
      problemId: problem.id,
      questionType: templateStructure.questionType,
      problemSetId,
    });

  } catch (error) {
    logger.error('Error creating problem from template:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create problem from template',
    });
  }
});

// 문제 유형별 가이드 조회 (GET /problem-templates/guides/:questionType)
router.get('/guides/:questionType', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { questionType } = req.params;

    const guides: { [key: string]: any } = {
      MULTIPLE_CHOICE: {
        title: "객관식 문제 작성 가이드",
        description: "효과적인 객관식 문제를 작성하는 방법",
        tips: [
          "명확하고 구체적인 문제를 작성하세요",
          "4-5개의 선택지를 제공하세요",
          "너무 쉽거나 너무 어려운 선택지는 피하세요",
          "정답이 명백하게 구분되도록 하세요",
          "선택지의 길이를 비슷하게 맞추세요",
        ],
        bestPractices: [
          "문제 상황을 구체적으로 제시",
          "오답 선택지도 논리적으로 타당하게",
          "부정형 문제('~가 아닌 것은?') 사용 최소화",
          "해설에서 정답과 오답의 근거를 모두 설명",
        ],
        examples: [
          {
            good: "다음 중 자바스크립트에서 변수를 선언하는 키워드가 아닌 것은?",
            bad: "자바스크립트에 대한 설명으로 틀린 것은?",
          },
        ],
      },
      TRUE_FALSE: {
        title: "참/거짓 문제 작성 가이드",
        description: "정확한 참/거짓 문제를 작성하는 방법",
        tips: [
          "절대적으로 참이거나 거짓인 명제를 사용하세요",
          "애매한 표현을 피하세요",
          "복합문보다는 단순문을 사용하세요",
          "예외가 있는 일반화는 피하세요",
        ],
        bestPractices: [
          "명확한 사실이나 정의를 다루는 문제",
          "추측이나 의견이 아닌 확실한 지식 검증",
          "부분적으로만 참인 명제는 거짓으로 처리",
        ],
      },
      SHORT_ANSWER: {
        title: "단답형 문제 작성 가이드",
        description: "명확한 단답형 문제를 작성하는 방법",
        tips: [
          "정답이 하나의 단어나 구문으로 명확한 문제",
          "여러 답이 가능한 경우 모든 정답을 명시",
          "철자나 띄어쓰기 오류에 대한 허용 범위 설정",
        ],
      },
      ESSAY: {
        title: "서술형 문제 작성 가이드", 
        description: "체계적인 서술형 문제를 작성하는 방법",
        tips: [
          "구체적인 평가 기준을 사전에 설정",
          "예상 답안 길이를 명시",
          "논리적 구조를 요구하는 문제 설계",
          "창의적 사고를 유도하는 개방형 질문",
        ],
      },
      CODING: {
        title: "코딩 문제 작성 가이드",
        description: "프로그래밍 문제를 작성하는 방법",
        tips: [
          "명확한 입출력 형식 정의",
          "시간 및 메모리 제한 설정",
          "다양한 테스트 케이스 준비",
          "예시 코드와 설명 제공",
          "알고리즘 복잡도 고려",
        ],
        bestPractices: [
          "단계별 난이도 설정",
          "실제 개발에 활용 가능한 문제",
          "다양한 접근법 허용",
        ],
      },
    };

    const guide = guides[questionType.toUpperCase()];
    
    if (!guide) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Guide not found for this question type',
      });
    }

    res.json({
      questionType: questionType.toUpperCase(),
      guide,
    });

  } catch (error) {
    logger.error('Error fetching problem guide:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch problem guide',
    });
  }
});

// 문제 검증 (POST /problem-templates/validate)
router.post('/validate', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { problemData } = req.body;

    if (!problemData) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Problem data is required',
      });
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // 기본 필드 검증
    if (!problemData.title || problemData.title.trim().length === 0) {
      errors.push('문제 제목이 필요합니다');
    }

    if (!problemData.content || problemData.content.trim().length === 0) {
      errors.push('문제 내용이 필요합니다');
    }

    if (!problemData.questionType) {
      errors.push('문제 유형이 필요합니다');
    }

    // 문제 유형별 검증
    switch (problemData.questionType) {
      case 'MULTIPLE_CHOICE':
        if (!problemData.choices || problemData.choices.length < 2) {
          errors.push('객관식 문제는 최소 2개의 선택지가 필요합니다');
        } else {
          const correctAnswers = problemData.choices.filter((c: any) => c.isCorrect).length;
          if (correctAnswers === 0) {
            errors.push('정답으로 설정된 선택지가 없습니다');
          }
          if (correctAnswers > 1) {
            warnings.push('여러 정답이 설정되어 있습니다. 의도된 것인지 확인해주세요');
          }
          if (problemData.choices.length < 4) {
            suggestions.push('객관식 문제는 4-5개의 선택지를 권장합니다');
          }
        }
        break;

      case 'TRUE_FALSE':
        if (!problemData.choices || problemData.choices.length !== 2) {
          errors.push('참/거짓 문제는 정확히 2개의 선택지가 필요합니다');
        }
        break;

      case 'SHORT_ANSWER':
      case 'ESSAY':
        if (!problemData.solution || problemData.solution.trim().length === 0) {
          warnings.push('모범답안이나 채점 기준을 입력해주세요');
        }
        break;

      case 'CODING':
        if (!problemData.solution) {
          warnings.push('참조 코드나 해설을 입력해주세요');
        }
        if (problemData.content && !problemData.content.includes('입력') && !problemData.content.includes('출력')) {
          suggestions.push('입출력 형식을 명확히 설명해주세요');
        }
        break;
    }

    // 점수 및 난이도 검증
    if (problemData.score && problemData.score <= 0) {
      errors.push('점수는 0보다 커야 합니다');
    }

    if (problemData.difficulty && (problemData.difficulty < 1 || problemData.difficulty > 10)) {
      errors.push('난이도는 1-10 사이의 값이어야 합니다');
    }

    // 콘텐츠 길이 검증
    if (problemData.content && problemData.content.length < 10) {
      warnings.push('문제 내용이 너무 짧습니다');
    }

    if (problemData.content && problemData.content.length > 5000) {
      warnings.push('문제 내용이 너무 깁니다. 간결하게 작성해보세요');
    }

    const validationResult = {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      score: {
        completeness: Math.max(0, 100 - errors.length * 20 - warnings.length * 5),
        quality: Math.max(0, 100 - warnings.length * 10 - suggestions.length * 5),
      },
    };

    res.json(validationResult);

    logger.info(`Problem validation performed by user ${req.user?.userId}`, {
      isValid: validationResult.isValid,
      errorsCount: errors.length,
      warningsCount: warnings.length,
      questionType: problemData.questionType,
    });

  } catch (error) {
    logger.error('Error validating problem:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to validate problem',
    });
  }
});

export default router;