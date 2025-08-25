import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, CheckCircle, XCircle, Lightbulb, RotateCcw } from 'lucide-react';
import apiService from '../../services/api';

interface Problem {
  id: string;
  title: string;
  description: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  problemType: 'MULTIPLE_CHOICE' | 'SHORT_ANSWER' | 'ESSAY';
  options?: string[];
  correctAnswer: string;
  explanation: string;
  category?: {
    id: string;
    name: string;
  };
}

export function ProblemSolver() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [problem, setProblem] = useState<Problem | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{
    isCorrect: boolean;
    explanation: string;
    nextReviewDate?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [startTime] = useState(Date.now());
  const [timeSpent, setTimeSpent] = useState(0);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (id) {
      loadProblem(id);
    }
  }, [id]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeSpent(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime]);

  const loadProblem = async (problemId: string) => {
    try {
      setLoading(true);
      const response = await apiService.getProblem(problemId);
      if (response.success && response.data) {
        setProblem(response.data);
      } else {
        throw new Error(response.message || '문제를 불러올 수 없습니다');
      }
    } catch (err) {
      console.error('Failed to load problem:', err);
      alert('문제를 불러오는데 실패했습니다.');
      navigate('/problems');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!problem || !userAnswer.trim()) return;

    try {
      setSubmitting(true);
      const response = await apiService.submitAnswer(problem.id, userAnswer);
      if (response.success && response.data) {
        setResult(response.data);
        setSubmitted(true);
      } else {
        throw new Error(response.message || '답안 제출에 실패했습니다');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '답안 제출에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTryAgain = () => {
    setUserAnswer('');
    setSubmitted(false);
    setResult(null);
    setShowHint(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'EASY':
        return 'text-success-600';
      case 'MEDIUM':
        return 'text-warning-600';
      case 'HARD':
        return 'text-error-600';
      default:
        return 'text-gray-600';
    }
  };

  const getDifficultyLabel = (difficulty: string) => {
    switch (difficulty) {
      case 'EASY':
        return '쉬움';
      case 'MEDIUM':
        return '보통';
      case 'HARD':
        return '어려움';
      default:
        return difficulty;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">문제를 찾을 수 없습니다.</p>
        <button
          onClick={() => navigate('/problems')}
          className="btn btn-primary btn-md mt-4"
        >
          문제 목록으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/problems')}
          className="btn btn-outline btn-sm mb-4 inline-flex items-center"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          문제 목록으로
        </button>
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{problem.title}</h1>
            <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
              <span className={getDifficultyColor(problem.difficulty)}>
                {getDifficultyLabel(problem.difficulty)}
              </span>
              {problem.category && (
                <span>{problem.category.name}</span>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center text-sm text-gray-600">
              <Clock className="h-4 w-4 mr-1" />
              {formatTime(timeSpent)}
            </div>
            {!submitted && (
              <button
                onClick={() => setShowHint(!showHint)}
                className="btn btn-outline btn-sm inline-flex items-center"
              >
                <Lightbulb className="h-4 w-4 mr-1" />
                힌트
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 문제 영역 */}
        <div className="lg:col-span-2">
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">문제</h2>
            <div className="prose max-w-none">
              <p className="text-gray-700 whitespace-pre-line">{problem.description}</p>
            </div>
          </div>

          {/* 힌트 */}
          {showHint && (
            <div className="bg-warning-50 border border-warning-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <Lightbulb className="h-5 w-5 text-warning-600 mt-0.5 mr-2" />
                <div>
                  <h3 className="text-sm font-medium text-warning-800 mb-1">힌트</h3>
                  <p className="text-sm text-warning-700">
                    이 문제는 {getDifficultyLabel(problem.difficulty)} 난이도입니다. 
                    차근차근 생각해보세요!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 답안 입력 */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">답안</h2>
            
            {problem.problemType === 'MULTIPLE_CHOICE' && problem.options ? (
              <div className="space-y-3">
                {problem.options.map((option, index) => (
                  <label
                    key={index}
                    className={`block p-4 border rounded-lg cursor-pointer transition-colors ${
                      userAnswer === option
                        ? 'border-primary-300 bg-primary-50'
                        : 'border-gray-300 hover:border-gray-400'
                    } ${submitted ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <input
                      type="radio"
                      name="answer"
                      value={option}
                      checked={userAnswer === option}
                      onChange={(e) => setUserAnswer(e.target.value)}
                      disabled={submitted}
                      className="sr-only"
                    />
                    <span className="text-gray-900">{option}</span>
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="답안을 입력하세요..."
                disabled={submitted}
                className="input min-h-[120px] resize-none"
                rows={5}
              />
            )}

            <div className="mt-6 flex items-center space-x-4">
              {!submitted ? (
                <button
                  onClick={handleSubmit}
                  disabled={!userAnswer.trim() || submitting}
                  className="btn btn-primary btn-lg"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      제출 중...
                    </>
                  ) : (
                    '답안 제출'
                  )}
                </button>
              ) : (
                <button
                  onClick={handleTryAgain}
                  className="btn btn-outline btn-lg inline-flex items-center"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  다시 풀기
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 결과 영역 */}
        <div className="lg:col-span-1">
          {submitted && result && (
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center mb-4">
                {result.isCorrect ? (
                  <>
                    <CheckCircle className="h-6 w-6 text-success-600 mr-2" />
                    <span className="text-lg font-semibold text-success-600">정답!</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-6 w-6 text-error-600 mr-2" />
                    <span className="text-lg font-semibold text-error-600">오답</span>
                  </>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">소요 시간</h3>
                  <p className="text-sm text-gray-600">{formatTime(timeSpent)}</p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">정답</h3>
                  <p className="text-sm text-gray-600">{problem.correctAnswer}</p>
                </div>

                {result.explanation && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-2">해설</h3>
                    <p className="text-sm text-gray-600 whitespace-pre-line">
                      {result.explanation}
                    </p>
                  </div>
                )}

                {result.nextReviewDate && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-2">다음 복습일</h3>
                    <p className="text-sm text-gray-600">
                      {new Date(result.nextReviewDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6">
                <button
                  onClick={() => navigate('/problems')}
                  className="btn btn-primary btn-md w-full"
                >
                  다른 문제 풀기
                </button>
              </div>
            </div>
          )}

          {/* 진행 상황 (문제를 풀기 전) */}
          {!submitted && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">진행 상황</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">소요 시간</span>
                  <span className="font-medium">{formatTime(timeSpent)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">난이도</span>
                  <span className={`font-medium ${getDifficultyColor(problem.difficulty)}`}>
                    {getDifficultyLabel(problem.difficulty)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}