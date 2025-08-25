import React, { useState, useEffect, useRef } from 'react';
import { ReviewCard as ReviewCardType, DifficultyFeedback, TimerState } from '../../types/review';
import './ReviewCard.css';

interface ReviewCardProps {
  card: ReviewCardType;
  onAnswer: (feedback: DifficultyFeedback, responseTime: number) => void;
  onSkip: () => void;
  onNext: () => void;
  isLastCard: boolean;
  currentIndex: number;
  totalCards: number;
}

export const ReviewCard: React.FC<ReviewCardProps> = ({
  card,
  onAnswer,
  onSkip,
  onNext,
  isLastCard,
  currentIndex,
  totalCards
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [timer, setTimer] = useState<TimerState>({
    isRunning: false,
    elapsedTime: 0
  });
  const [hasAnswered, setHasAnswered] = useState(false);
  const timerRef = useRef<NodeJS.Timeout>();
  const startTimeRef = useRef<Date>();

  // 타이머 시작
  useEffect(() => {
    startTimeRef.current = new Date();
    setTimer({ isRunning: true, elapsedTime: 0 });
    
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        const elapsed = Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000);
        setTimer(prev => ({ ...prev, elapsedTime: elapsed }));
      }
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [card.id]);

  // 카드 플립 핸들러
  const handleCardFlip = () => {
    if (!hasAnswered) {
      setIsFlipped(!isFlipped);
      setShowAnswer(!showAnswer);
    }
  };

  // 난이도 피드백 제출
  const handleFeedback = (feedback: DifficultyFeedback) => {
    if (!hasAnswered && startTimeRef.current) {
      const responseTime = Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000);
      setHasAnswered(true);
      setTimer(prev => ({ ...prev, isRunning: false }));
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      onAnswer(feedback, responseTime);
    }
  };

  // 시간 포맷팅
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 진도율 계산
  const progressPercentage = ((currentIndex + 1) / totalCards) * 100;

  return (
    <div className="review-card-container">
      {/* 진도율 표시 */}
      <div className="review-progress">
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <span className="progress-text">
          {currentIndex + 1} / {totalCards} ({Math.round(progressPercentage)}%)
        </span>
      </div>

      {/* 타이머 */}
      <div className="review-timer">
        <span className={`timer ${timer.isRunning ? 'running' : 'stopped'}`}>
          ⏱️ {formatTime(timer.elapsedTime)}
        </span>
      </div>

      {/* 카드 레벨 표시 */}
      <div className="card-level">
        <span className={`level-badge level-${card.currentLevel.toLowerCase()}`}>
          레벨 {card.currentLevel.replace('LEVEL_', '')}
        </span>
        {card.isOverdue && <span className="overdue-badge">지연됨</span>}
      </div>

      {/* 메인 카드 */}
      <div className={`card-wrapper ${isFlipped ? 'flipped' : ''}`}>
        <div className="card" onClick={handleCardFlip}>
          {/* 카드 앞면 (문제) */}
          <div className="card-front">
            <div className="card-header">
              <h3 className="problem-title">{card.problem.title}</h3>
              <div className="problem-meta">
                <span className="category">{card.problem.category}</span>
                <span className="difficulty">난이도: {card.problem.difficulty}/10</span>
              </div>
            </div>
            
            <div className="card-content">
              <div className="problem-content">
                {card.problem.content}
              </div>
              
              <div className="problem-tags">
                {card.problem.tags.map((tag, index) => (
                  <span key={index} className="tag">#{tag}</span>
                ))}
              </div>
            </div>

            <div className="flip-hint">
              <span>💡 클릭하여 답 확인</span>
            </div>
          </div>

          {/* 카드 뒷면 (답안) */}
          <div className="card-back">
            <div className="card-header">
              <h3 className="answer-title">정답</h3>
            </div>
            
            <div className="card-content">
              <div className="problem-answer">
                {card.problem.answer}
              </div>
              
              {card.problem.explanation && (
                <div className="problem-explanation">
                  <h4>해설</h4>
                  <p>{card.problem.explanation}</p>
                </div>
              )}
            </div>

            <div className="flip-hint">
              <span>💡 클릭하여 문제 보기</span>
            </div>
          </div>
        </div>
      </div>

      {/* 제어 버튼들 */}
      <div className="card-controls">
        {!hasAnswered ? (
          <>
            {/* 난이도 피드백 버튼 */}
            <div className="feedback-buttons">
              <button 
                className="feedback-btn again"
                onClick={() => handleFeedback(DifficultyFeedback.AGAIN)}
                title="다시 복습 필요"
              >
                <span className="btn-icon">🔄</span>
                <span>다시</span>
              </button>
              
              <button 
                className="feedback-btn hard"
                onClick={() => handleFeedback(DifficultyFeedback.HARD)}
                title="어려웠음"
              >
                <span className="btn-icon">😰</span>
                <span>어려움</span>
              </button>
              
              <button 
                className="feedback-btn good"
                onClick={() => handleFeedback(DifficultyFeedback.GOOD)}
                title="적절했음"
              >
                <span className="btn-icon">👍</span>
                <span>알맞음</span>
              </button>
              
              <button 
                className="feedback-btn easy"
                onClick={() => handleFeedback(DifficultyFeedback.EASY)}
                title="너무 쉬웠음"
              >
                <span className="btn-icon">😎</span>
                <span>쉬움</span>
              </button>
            </div>

            {/* 기타 컨트롤 */}
            <div className="other-controls">
              <button className="control-btn skip" onClick={onSkip}>
                건너뛰기
              </button>
            </div>
          </>
        ) : (
          /* 답변 완료 후 */
          <div className="completion-controls">
            <div className="completion-message">
              <span>✅ 답변 완료! 소요시간: {formatTime(timer.elapsedTime)}</span>
            </div>
            
            <button 
              className="control-btn next primary"
              onClick={onNext}
            >
              {isLastCard ? '완료' : '다음 카드'}
            </button>
          </div>
        )}
      </div>

      {/* 카드 통계 정보 */}
      <div className="card-stats">
        <div className="stat-item">
          <span className="stat-label">복습 횟수</span>
          <span className="stat-value">{card.completionCount}회</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">연속 성공</span>
          <span className="stat-value">{card.consecutiveSuccesses}회</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">기억 유지율</span>
          <span className="stat-value">{Math.round(card.retentionRate * 100)}%</span>
        </div>
      </div>
    </div>
  );
};

export default ReviewCard;