import React, { useState, useEffect, useCallback } from 'react';
import ReviewCard from '../ReviewCard/ReviewCard';
import { 
  ReviewCard as ReviewCardType, 
  ReviewSession as ReviewSessionType,
  ReviewProgress,
  DifficultyFeedback 
} from '../../types/review';
import './ReviewSession.css';

interface ReviewSessionProps {
  initialCards: ReviewCardType[];
  onSessionComplete: (session: ReviewSessionType) => void;
  onSessionPause: (progress: ReviewProgress) => void;
  userId: string;
}

export const ReviewSession: React.FC<ReviewSessionProps> = ({
  initialCards,
  onSessionComplete,
  onSessionPause,
  userId
}) => {
  const [cards, setCards] = useState<ReviewCardType[]>(initialCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [session, setSession] = useState<ReviewSessionType>({
    id: `session_${Date.now()}`,
    userId,
    startedAt: new Date(),
    totalCards: initialCards.length,
    completedCards: 0,
    correctAnswers: 0,
    averageResponseTime: 0,
    isActive: true
  });
  const [responses, setResponses] = useState<Array<{
    cardId: string;
    feedback: DifficultyFeedback;
    responseTime: number;
    timestamp: Date;
  }>>([]);
  const [showCompletion, setShowCompletion] = useState(false);

  // 진도율 계산
  const progress: ReviewProgress = {
    totalCards: cards.length,
    completedCards: session.completedCards,
    correctAnswers: session.correctAnswers,
    completionRate: (session.completedCards / cards.length) * 100,
    accuracyRate: session.completedCards > 0 ? (session.correctAnswers / session.completedCards) * 100 : 0,
    estimatedTimeRemaining: Math.ceil((cards.length - currentIndex) * (session.averageResponseTime || 30) / 60),
    currentStreak: calculateCurrentStreak(),
    bestStreak: calculateBestStreak()
  };

  // 현재 연속 정답 수 계산
  function calculateCurrentStreak(): number {
    let streak = 0;
    for (let i = responses.length - 1; i >= 0; i--) {
      if (responses[i].feedback === DifficultyFeedback.GOOD || responses[i].feedback === DifficultyFeedback.EASY) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  // 최고 연속 정답 수 계산
  function calculateBestStreak(): number {
    let maxStreak = 0;
    let currentStreak = 0;
    
    responses.forEach(response => {
      if (response.feedback === DifficultyFeedback.GOOD || response.feedback === DifficultyFeedback.EASY) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    });
    
    return maxStreak;
  }

  // 답변 처리
  const handleAnswer = useCallback((feedback: DifficultyFeedback, responseTime: number) => {
    const currentCard = cards[currentIndex];
    const isCorrect = feedback === DifficultyFeedback.GOOD || feedback === DifficultyFeedback.EASY;
    
    // 응답 기록
    const newResponse = {
      cardId: currentCard.id,
      feedback,
      responseTime,
      timestamp: new Date()
    };
    
    setResponses(prev => [...prev, newResponse]);
    
    // 세션 업데이트
    setSession(prev => {
      const newCompletedCards = prev.completedCards + 1;
      const newCorrectAnswers = prev.correctAnswers + (isCorrect ? 1 : 0);
      const totalResponseTime = responses.reduce((sum, r) => sum + r.responseTime, 0) + responseTime;
      const newAverageResponseTime = totalResponseTime / newCompletedCards;
      
      return {
        ...prev,
        completedCards: newCompletedCards,
        correctAnswers: newCorrectAnswers,
        averageResponseTime: newAverageResponseTime
      };
    });

    // 백엔드 API 호출하여 복습 결과 전송
    submitReviewResult(currentCard.id, feedback, responseTime);
    
  }, [currentIndex, cards, responses]);

  // 건너뛰기 처리
  const handleSkip = useCallback(() => {
    // 건너뛴 카드를 맨 뒤로 이동
    const currentCard = cards[currentIndex];
    const remainingCards = cards.slice(currentIndex + 1);
    const newCards = [...remainingCards, currentCard];
    
    setCards(prev => [
      ...prev.slice(0, currentIndex),
      ...newCards
    ]);
    
    // 인덱스는 그대로 유지 (다음 카드가 현재 위치로 이동)
  }, [currentIndex, cards]);

  // 다음 카드로 이동
  const handleNext = useCallback(() => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // 세션 완료
      handleSessionComplete();
    }
  }, [currentIndex, cards.length]);

  // 세션 완료 처리
  const handleSessionComplete = useCallback(() => {
    const completedSession: ReviewSessionType = {
      ...session,
      endedAt: new Date(),
      isActive: false
    };
    
    setSession(completedSession);
    setShowCompletion(true);
    onSessionComplete(completedSession);
  }, [session, onSessionComplete]);

  // 세션 일시정지
  const handlePause = useCallback(() => {
    onSessionPause(progress);
  }, [progress, onSessionPause]);

  // 복습 결과를 백엔드에 전송
  const submitReviewResult = async (cardId: string, feedback: DifficultyFeedback, responseTime: number) => {
    try {
      // 실제 API 호출
      const response = await fetch('/api/forgetting-curve/complete-review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({
          cardId,
          feedback,
          responseTime,
          confidenceLevel: feedbackToConfidence(feedback)
        })
      });

      if (!response.ok) {
        console.error('Failed to submit review result');
      }
    } catch (error) {
      console.error('Error submitting review result:', error);
    }
  };

  // 피드백을 신뢰도 레벨로 변환
  const feedbackToConfidence = (feedback: DifficultyFeedback): number => {
    switch (feedback) {
      case DifficultyFeedback.AGAIN: return 1;
      case DifficultyFeedback.HARD: return 2;
      case DifficultyFeedback.GOOD: return 4;
      case DifficultyFeedback.EASY: return 5;
      default: return 3;
    }
  };

  // 세션 완료 화면
  if (showCompletion) {
    return (
      <div className="review-session-completion">
        <div className="completion-card">
          <div className="completion-header">
            <h2>🎉 복습 세션 완료!</h2>
            <p>수고하셨습니다. 오늘의 복습을 모두 완료했어요.</p>
          </div>
          
          <div className="completion-stats">
            <div className="stat-grid">
              <div className="stat-item">
                <span className="stat-number">{progress.completedCards}</span>
                <span className="stat-label">완료한 카드</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">{Math.round(progress.accuracyRate)}%</span>
                <span className="stat-label">정답률</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">{Math.round(session.averageResponseTime)}초</span>
                <span className="stat-label">평균 응답시간</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">{progress.bestStreak}</span>
                <span className="stat-label">최고 연속정답</span>
              </div>
            </div>
            
            <div className="time-summary">
              <p>총 소요시간: {Math.round((Date.now() - session.startedAt.getTime()) / 60000)}분</p>
            </div>
          </div>
          
          <div className="completion-actions">
            <button className="action-btn primary" onClick={() => window.location.reload()}>
              새 복습 시작
            </button>
            <button className="action-btn secondary" onClick={() => window.history.back()}>
              대시보드로 돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 메인 복습 화면
  return (
    <div className="review-session">
      {/* 세션 헤더 */}
      <div className="session-header">
        <div className="session-info">
          <h1 className="session-title">복습 세션</h1>
          <p className="session-subtitle">오늘 복습할 카드들을 차례대로 풀어보세요</p>
        </div>
        
        <div className="session-controls">
          <button className="control-btn pause" onClick={handlePause}>
            ⏸️ 일시정지
          </button>
        </div>
      </div>

      {/* 전체 진도율 */}
      <div className="session-progress">
        <div className="progress-stats">
          <div className="stat">
            <span className="value">{progress.completedCards}</span>
            <span className="label">완료</span>
          </div>
          <div className="stat">
            <span className="value">{Math.round(progress.accuracyRate)}%</span>
            <span className="label">정답률</span>
          </div>
          <div className="stat">
            <span className="value">{progress.currentStreak}</span>
            <span className="label">연속정답</span>
          </div>
          <div className="stat">
            <span className="value">{progress.estimatedTimeRemaining}분</span>
            <span className="label">예상 남은시간</span>
          </div>
        </div>
      </div>

      {/* 현재 카드 */}
      {currentIndex < cards.length && (
        <ReviewCard
          card={cards[currentIndex]}
          onAnswer={handleAnswer}
          onSkip={handleSkip}
          onNext={handleNext}
          isLastCard={currentIndex === cards.length - 1}
          currentIndex={currentIndex}
          totalCards={cards.length}
        />
      )}

      {/* 응답 히스토리 (최근 5개만) */}
      {responses.length > 0 && (
        <div className="response-history">
          <h3>최근 답변</h3>
          <div className="history-items">
            {responses.slice(-5).map((response, index) => (
              <div key={index} className={`history-item ${response.feedback.toLowerCase()}`}>
                <span className="feedback">{getFeedbackEmoji(response.feedback)}</span>
                <span className="time">{response.responseTime}초</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// 피드백 이모지 반환
const getFeedbackEmoji = (feedback: DifficultyFeedback): string => {
  switch (feedback) {
    case DifficultyFeedback.AGAIN: return '🔄';
    case DifficultyFeedback.HARD: return '😰';
    case DifficultyFeedback.GOOD: return '👍';
    case DifficultyFeedback.EASY: return '😎';
    default: return '❓';
  }
};

export default ReviewSession;