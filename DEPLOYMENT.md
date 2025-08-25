# WoodieCampus 배포 가이드

## 🚀 개요

WoodieCampus는 망각곡선 알고리즘 기반의 스마트 학습 플랫폼으로, Docker Compose를 통해 전체 시스템을 쉽게 배포할 수 있습니다.

## 🏗️ 시스템 아키텍처

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Gateway       │    │   Backend       │
│   (React/Vite)  │◄──►│   (NGINX)       │◄──►│   (Node.js)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                 │                       │
                                 ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   PostgreSQL    │    │     Redis       │
                       │   (Database)    │    │    (Cache)      │
                       └─────────────────┘    └─────────────────┘
```

## 📋 시스템 요구사항

### 최소 사양
- **CPU**: 2 코어
- **메모리**: 4GB RAM
- **디스크**: 20GB 여유공간
- **네트워크**: 인터넷 연결

### 권장 사양
- **CPU**: 4 코어 이상
- **메모리**: 8GB RAM 이상
- **디스크**: SSD 50GB 이상
- **네트워크**: 고속 인터넷 연결

## 🔧 사전 준비

### 필수 소프트웨어 설치
```bash
# Docker & Docker Compose 설치
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Docker Compose 설치 확인
docker-compose --version
```

### Git 클론
```bash
git clone https://github.com/your-org/WoodieCampus.git
cd WoodieCampus
```

## 🚀 배포 단계

### 1. 환경 변수 설정

#### 백엔드 환경 변수 (.env)
```bash
# 데이터베이스 설정
DB_HOST=postgres
DB_PORT=5432
DB_NAME=woodiecampus
DB_USER=postgres
DB_PASSWORD=your_secure_password_here

# Redis 설정
REDIS_URL=redis://redis:6379

# JWT 보안
JWT_SECRET=your_very_secure_jwt_secret_here
JWT_EXPIRES_IN=7d

# 서버 설정
NODE_ENV=production
PORT=3000
CORS_ORIGIN=http://frontend

# 기타 설정
LOG_LEVEL=info
```

#### 프론트엔드 환경 변수 (.env.production)
```bash
# API 설정
VITE_API_URL=http://backend:3000/api
VITE_WS_URL=ws://backend:3000

# 앱 설정
VITE_APP_NAME=WoodieCampus
VITE_ENABLE_PWA=true
VITE_ENABLE_OFFLINE=true
```

### 2. Docker 이미지 빌드
```bash
# 모든 서비스 빌드
docker-compose build

# 또는 개별 빌드
docker-compose build frontend
docker-compose build backend
```

### 3. 데이터베이스 초기화
```bash
# 데이터베이스 컨테이너 시작
docker-compose up -d postgres redis

# 마이그레이션 실행
docker-compose exec backend npm run migrate:deploy

# 시드 데이터 생성 (선택사항)
docker-compose exec backend npm run seed
```

### 4. 전체 시스템 시작
```bash
# 모든 서비스 시작 (백그라운드)
docker-compose up -d

# 로그 확인
docker-compose logs -f

# 특정 서비스 로그 확인
docker-compose logs -f frontend
docker-compose logs -f backend
```

## 🔍 서비스 확인

### 헬스체크
```bash
# 각 서비스 상태 확인
docker-compose ps

# 프론트엔드 접근 (웹 브라우저)
http://localhost:80

# 백엔드 API 헬스체크
curl http://localhost:3000/health

# 데이터베이스 연결 확인
docker-compose exec postgres psql -U postgres -d woodiecampus -c "SELECT version();"
```

### 주요 URL
- **메인 웹사이트**: http://localhost
- **API 문서**: http://localhost/api/docs
- **관리자 패널**: http://localhost/admin

## 🔧 운영 및 관리

### 로그 관리
```bash
# 로그 확인
docker-compose logs --tail=100 -f [service_name]

# 로그 파일 위치
./backend/logs/app.log
./backend/logs/error.log
```

### 백업 및 복원
```bash
# 데이터베이스 백업
docker-compose exec postgres pg_dump -U postgres woodiecampus > backup.sql

# 데이터베이스 복원
docker-compose exec -T postgres psql -U postgres woodiecampus < backup.sql

# Redis 백업
docker-compose exec redis redis-cli SAVE
docker cp $(docker-compose ps -q redis):/data/dump.rdb ./redis-backup.rdb
```

### 업데이트
```bash
# 코드 업데이트
git pull origin main

# 이미지 재빌드 및 재시작
docker-compose build
docker-compose up -d

# 마이그레이션 실행 (필요시)
docker-compose exec backend npm run migrate:deploy
```

### 스케일링
```bash
# 백엔드 인스턴스 증가
docker-compose up -d --scale backend=3

# 프론트엔드 인스턴스 증가 (로드밸런서 필요)
docker-compose up -d --scale frontend=2
```

## 🔒 보안 고려사항

### SSL/TLS 설정
```bash
# Let's Encrypt 인증서 (Certbot 사용)
sudo apt install certbot

# 인증서 발급
sudo certbot certonly --webroot -w /var/www/html -d yourdomain.com

# NGINX SSL 설정 업데이트 필요
```

### 방화벽 설정
```bash
# UFW 방화벽 설정 (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 보안 권장사항
1. **강력한 패스워드 사용**: 데이터베이스 및 JWT 시크릿
2. **정기 업데이트**: 시스템 및 의존성 업데이트
3. **접근 제한**: 불필요한 포트 차단
4. **로그 모니터링**: 비정상적인 접근 감지
5. **백업 자동화**: 정기적인 데이터 백업

## 📊 모니터링

### 성능 모니터링
```bash
# 컨테이너 리소스 사용량
docker stats

# 개별 서비스 모니터링
docker-compose exec backend npm run monitor
```

### 로그 분석 도구
- **ELK Stack**: Elasticsearch + Logstash + Kibana
- **Grafana**: 메트릭 시각화
- **Prometheus**: 메트릭 수집

## 🆘 문제 해결

### 일반적인 문제

#### 1. 컨테이너 시작 실패
```bash
# 자세한 에러 로그 확인
docker-compose logs [service_name]

# 컨테이너 재시작
docker-compose restart [service_name]
```

#### 2. 데이터베이스 연결 실패
```bash
# PostgreSQL 상태 확인
docker-compose exec postgres pg_isready -U postgres

# 연결 테스트
docker-compose exec backend npm run db:test
```

#### 3. 메모리 부족
```bash
# 메모리 사용량 확인
docker stats --no-stream

# 불필요한 컨테이너/이미지 정리
docker system prune -a
```

#### 4. 포트 충돌
```bash
# 포트 사용 확인
sudo netstat -tlnp | grep :80

# 다른 포트로 변경 (docker-compose.yml 수정)
ports:
  - "8080:80"
```

## 📞 지원 및 문의

- **이슈 리포트**: https://github.com/your-org/WoodieCampus/issues
- **문서**: https://docs.woodiecampus.com
- **이메일**: support@woodiecampus.com

---

## 📝 체크리스트

배포 전 확인사항:

- [ ] Docker & Docker Compose 설치 완료
- [ ] 환경 변수 파일 (.env) 설정 완료
- [ ] 데이터베이스 마이그레이션 실행 완료
- [ ] 방화벽 및 보안 설정 완료
- [ ] SSL 인증서 설정 (프로덕션)
- [ ] 백업 시스템 구축 완료
- [ ] 모니터링 도구 설정 완료

배포 완료 후 확인사항:

- [ ] 웹사이트 정상 접근 확인
- [ ] 사용자 회원가입/로그인 테스트
- [ ] 문제 풀이 기능 테스트
- [ ] 관리자 패널 접근 확인
- [ ] API 응답 시간 확인
- [ ] 데이터베이스 연결 안정성 확인

🎉 **축하합니다! WoodieCampus가 성공적으로 배포되었습니다!**