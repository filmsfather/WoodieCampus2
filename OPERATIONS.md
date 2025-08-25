# WoodieCampus 운영 가이드

## 🎯 개요

이 문서는 WoodieCampus의 일상적인 운영, 모니터링, 유지보수에 대한 가이드를 제공합니다.

## 📊 모니터링 및 관찰

### 시스템 상태 확인

#### 서비스 상태 점검
```bash
# 모든 컨테이너 상태 확인
docker-compose ps

# 실시간 리소스 사용량
docker stats

# 시스템 로그 모니터링
docker-compose logs -f --tail=100

# 특정 서비스 로그
docker-compose logs -f frontend
docker-compose logs -f backend
docker-compose logs -f postgres
```

#### 헬스체크 엔드포인트
```bash
# 백엔드 API 상태
curl http://localhost:3000/health

# 프론트엔드 접근성
curl -I http://localhost

# 데이터베이스 연결
docker-compose exec backend npm run db:health
```

### 핵심 메트릭 모니터링

#### 응답시간 모니터링
```bash
# API 응답시간 측정
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/api/health

# curl-format.txt 내용:
#      time_namelookup:  %{time_namelookup}\n
#         time_connect:  %{time_connect}\n
#      time_appconnect:  %{time_appconnect}\n
#     time_pretransfer:  %{time_pretransfer}\n
#        time_redirect:  %{time_redirect}\n
#   time_starttransfer:  %{time_starttransfer}\n
#                     ----------\n
#           time_total:  %{time_total}\n
```

#### 사용자 활동 모니터링
```bash
# 활성 사용자 수 확인
docker-compose exec backend npm run analytics:active-users

# 오늘 문제 풀이 통계
docker-compose exec backend npm run analytics:daily-stats

# 시스템 성능 리포트
docker-compose exec backend npm run analytics:performance
```

## 🔧 일상 운영 작업

### 데이터베이스 관리

#### 정기 백업
```bash
# 일일 백업 스크립트 생성
cat > daily-backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup"

# PostgreSQL 백업
docker-compose exec postgres pg_dump -U postgres woodiecampus > ${BACKUP_DIR}/db_${DATE}.sql

# Redis 백업
docker-compose exec redis redis-cli SAVE
docker cp $(docker-compose ps -q redis):/data/dump.rdb ${BACKUP_DIR}/redis_${DATE}.rdb

# 7일 이상 된 백업 파일 삭제
find ${BACKUP_DIR} -name "*.sql" -mtime +7 -delete
find ${BACKUP_DIR} -name "*.rdb" -mtime +7 -delete

echo "Backup completed: ${DATE}"
EOF

chmod +x daily-backup.sh
```

#### 데이터베이스 최적화
```bash
# 인덱스 재구성
docker-compose exec postgres psql -U postgres -d woodiecampus -c "REINDEX DATABASE woodiecampus;"

# 통계 업데이트
docker-compose exec postgres psql -U postgres -d woodiecampus -c "ANALYZE;"

# 테이블 공간 확인
docker-compose exec postgres psql -U postgres -d woodiecampus -c "
SELECT schemaname,tablename,attname,n_distinct,correlation 
FROM pg_stats 
WHERE tablename IN ('users', 'problems', 'submissions');"
```

### 로그 관리

#### 로그 순환 설정
```bash
# logrotate 설정
cat > /etc/logrotate.d/woodiecampus << 'EOF'
/var/log/woodiecampus/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
    postrotate
        docker-compose restart backend
    endscript
}
EOF
```

#### 에러 로그 분석
```bash
# 최근 1시간 에러 로그
docker-compose logs --since="1h" backend | grep ERROR

# 에러 패턴 분석
docker-compose logs backend | grep -E "(ERROR|FATAL|CRITICAL)" | \
awk '{print $4}' | sort | uniq -c | sort -nr

# 느린 쿼리 분석
docker-compose exec postgres psql -U postgres -d woodiecampus -c "
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;"
```

## 🚨 알림 및 경고 시스템

### 모니터링 스크립트

#### 시스템 상태 체크
```bash
# system-health.sh
#!/bin/bash

# 설정
SLACK_WEBHOOK_URL="your_slack_webhook_url"
EMAIL_ALERT="admin@woodiecampus.com"
THRESHOLD_CPU=80
THRESHOLD_MEMORY=90
THRESHOLD_DISK=85

# CPU 사용률 확인
CPU_USAGE=$(docker stats --no-stream --format "table {{.CPUPerc}}" | grep -v CPU | sed 's/%//' | sort -n | tail -1)

# 메모리 사용률 확인
MEMORY_USAGE=$(docker stats --no-stream --format "table {{.MemPerc}}" | grep -v MEM | sed 's/%//' | sort -n | tail -1)

# 디스크 사용률 확인
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')

# 알림 함수
send_alert() {
    local message="$1"
    
    # Slack 알림
    curl -X POST -H 'Content-type: application/json' \
        --data "{\"text\":\"🚨 WoodieCampus Alert: $message\"}" \
        $SLACK_WEBHOOK_URL
    
    # 이메일 알림
    echo "$message" | mail -s "WoodieCampus Alert" $EMAIL_ALERT
}

# 임계값 체크
if (( $(echo "$CPU_USAGE > $THRESHOLD_CPU" | bc -l) )); then
    send_alert "CPU usage is high: ${CPU_USAGE}%"
fi

if (( $(echo "$MEMORY_USAGE > $THRESHOLD_MEMORY" | bc -l) )); then
    send_alert "Memory usage is high: ${MEMORY_USAGE}%"
fi

if (( $DISK_USAGE > $THRESHOLD_DISK )); then
    send_alert "Disk usage is high: ${DISK_USAGE}%"
fi
```

#### 서비스 가용성 체크
```bash
# service-check.sh
#!/bin/bash

# 서비스 URL 배열
services=(
    "http://localhost:80"
    "http://localhost:3000/health"
)

for service in "${services[@]}"; do
    if ! curl -f -s -o /dev/null "$service"; then
        send_alert "Service unavailable: $service"
    fi
done
```

### Cron 작업 설정
```bash
# crontab 편집
crontab -e

# 추가할 작업들
# 매 5분마다 시스템 상태 체크
*/5 * * * * /opt/woodiecampus/system-health.sh

# 매 15분마다 서비스 가용성 체크
*/15 * * * * /opt/woodiecampus/service-check.sh

# 매일 새벽 2시 백업
0 2 * * * /opt/woodiecampus/daily-backup.sh

# 매주 일요일 새벽 3시 데이터베이스 최적화
0 3 * * 0 /opt/woodiecampus/db-optimize.sh
```

## 📈 성능 최적화

### 데이터베이스 최적화

#### 쿼리 성능 분석
```sql
-- 느린 쿼리 식별
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    (total_time/calls) as avg_time_ms
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 20;

-- 인덱스 사용률 확인
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation
FROM pg_stats
WHERE tablename IN ('users', 'problems', 'submissions', 'progress')
ORDER BY n_distinct DESC;
```

#### Redis 성능 모니터링
```bash
# Redis 정보 확인
docker-compose exec redis redis-cli INFO stats

# 메모리 사용량 확인
docker-compose exec redis redis-cli INFO memory

# 캐시 히트율 확인
docker-compose exec redis redis-cli INFO stats | grep -E "(keyspace_hits|keyspace_misses)"
```

### 애플리케이션 최적화

#### Node.js 프로세스 모니터링
```bash
# PM2로 프로세스 관리 (선택사항)
npm install -g pm2

# 프로세스 모니터링 시작
pm2 start ecosystem.config.js
pm2 monit

# 메모리 사용량 확인
pm2 show app
```

## 🔄 업데이트 및 배포

### 무중단 배포 전략

#### Blue-Green 배포
```bash
# 새 버전 빌드
git pull origin main
docker-compose build

# 새 컨테이너 시작 (다른 포트)
docker-compose -f docker-compose.green.yml up -d

# 헬스체크 확인
curl http://localhost:8080/health

# 트래픽 전환 (로드밸런서 설정)
# nginx upstream 설정 변경 후 reload

# 기존 컨테이너 종료
docker-compose -f docker-compose.blue.yml down
```

#### 데이터베이스 마이그레이션
```bash
# 마이그레이션 백업
docker-compose exec postgres pg_dump -U postgres woodiecampus > pre-migration-backup.sql

# 마이그레이션 실행
docker-compose exec backend npm run migrate:deploy

# 롤백 준비
docker-compose exec backend npm run migrate:rollback
```

## 🔒 보안 운영

### 보안 점검 체크리스트

#### 정기 보안 점검
```bash
# 1. 컨테이너 취약점 스캔
docker scout cves

# 2. 의존성 보안 점검
docker-compose exec backend npm audit
docker-compose exec frontend npm audit

# 3. 로그 분석 - 의심스러운 활동
docker-compose logs backend | grep -E "(404|401|403|500)" | tail -100

# 4. 연결 시도 분석
docker-compose logs gateway | grep -E "GET|POST" | awk '{print $1}' | sort | uniq -c | sort -nr
```

#### SSL 인증서 갱신
```bash
# Let's Encrypt 인증서 갱신
certbot renew --dry-run

# 자동 갱신 설정 확인
crontab -l | grep certbot
```

## 🆘 장애 대응

### 장애 대응 절차

#### 1단계: 문제 식별
```bash
# 서비스 상태 확인
docker-compose ps

# 리소스 사용량 확인
docker stats

# 에러 로그 확인
docker-compose logs --tail=50 backend
```

#### 2단계: 즉시 조치
```bash
# 서비스 재시작
docker-compose restart [service_name]

# 메모리 정리
docker system prune -f

# 디스크 공간 확보
docker volume prune -f
```

#### 3단계: 근본 원인 분석
```bash
# 상세 로그 분석
docker-compose logs --since="2h" backend > error-analysis.log

# 데이터베이스 상태 확인
docker-compose exec postgres psql -U postgres -d woodiecampus -c "
SELECT 
    pid, 
    now() - pg_stat_activity.query_start AS duration, 
    query 
FROM pg_stat_activity 
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';"
```

### 복구 절차

#### 데이터베이스 복구
```bash
# 백업에서 복구
docker-compose exec postgres psql -U postgres -d woodiecampus < backup.sql

# 복구 검증
docker-compose exec backend npm run db:validate
```

#### 완전 시스템 복구
```bash
# 모든 컨테이너 중지
docker-compose down

# 볼륨 백업 (필요시)
docker run --rm -v woodiecampus_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-data.tar.gz -C /data .

# 시스템 재시작
docker-compose up -d
```

## 📋 운영 체크리스트

### 일일 점검사항
- [ ] 시스템 상태 및 리소스 사용량 확인
- [ ] 에러 로그 검토
- [ ] 백업 상태 확인
- [ ] 사용자 활동 모니터링

### 주간 점검사항
- [ ] 성능 메트릭 분석
- [ ] 데이터베이스 최적화 실행
- [ ] 보안 로그 분석
- [ ] 용량 계획 검토

### 월간 점검사항
- [ ] 시스템 업데이트 계획
- [ ] 보안 취약점 점검
- [ ] 백업 복구 테스트
- [ ] 용량 증설 계획

---

## 📞 운영 지원

### 에스컬레이션 절차
1. **Level 1**: 자동 모니터링 및 알림
2. **Level 2**: 운영팀 즉시 대응
3. **Level 3**: 개발팀 긴급 호출
4. **Level 4**: 전체 시스템 장애 대응

### 연락처
- **운영팀**: ops@woodiecampus.com
- **개발팀**: dev@woodiecampus.com  
- **24/7 핫라인**: +82-10-xxxx-xxxx

🎯 **효율적인 운영을 통해 안정적인 WoodieCampus 서비스를 제공합시다!**