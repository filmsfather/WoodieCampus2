#!/bin/bash

# WoodieCampus 롤백 스크립트
# 사용법: ./rollback.sh [환경]
# 예시: ./rollback.sh production

set -e  # 오류 시 즉시 종료

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로깅 함수
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 기본값 설정
ENVIRONMENT=${1:-staging}

# 환경 검증
if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
    log_error "Invalid environment: $ENVIRONMENT. Use 'staging' or 'production'"
    exit 1
fi

log_info "Starting rollback for $ENVIRONMENT environment"

# 백업 이미지 파일 확인
BACKUP_BACKEND_FILE=".backup_backend_image"
BACKUP_FRONTEND_FILE=".backup_frontend_image"
BACKUP_NGINX_FILE=".backup_nginx_image"

if [ ! -f "$BACKUP_BACKEND_FILE" ] || [ ! -f "$BACKUP_FRONTEND_FILE" ] || [ ! -f "$BACKUP_NGINX_FILE" ]; then
    log_error "Backup image files not found. Cannot perform rollback."
    log_info "Required files: $BACKUP_BACKEND_FILE, $BACKUP_FRONTEND_FILE, $BACKUP_NGINX_FILE"
    exit 1
fi

# 백업된 이미지 태그 읽기
BACKUP_BACKEND_IMAGE=$(cat "$BACKUP_BACKEND_FILE")
BACKUP_FRONTEND_IMAGE=$(cat "$BACKUP_FRONTEND_FILE")
BACKUP_NGINX_IMAGE=$(cat "$BACKUP_NGINX_FILE")

log_info "Found backup images:"
log_info "  Backend: $BACKUP_BACKEND_IMAGE"
log_info "  Frontend: $BACKUP_FRONTEND_IMAGE"
log_info "  Nginx: $BACKUP_NGINX_IMAGE"

# 사용자 확인
read -p "Do you want to proceed with rollback? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Rollback cancelled."
    exit 0
fi

# 환경별 설정
case $ENVIRONMENT in
    "staging")
        COMPOSE_FILE="docker-compose.yml:docker-compose.dev.yml"
        ENV_FILE=".env.staging"
        ;;
    "production")
        COMPOSE_FILE="docker-compose.prod.yml"
        ENV_FILE=".env.production"
        ;;
esac

# 환경 변수 로드
if [ -f "$ENV_FILE" ]; then
    log_info "Loading environment variables from $ENV_FILE"
    export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

# 롤백 함수
rollback_service() {
    local service_name=$1
    local backup_image=$2
    
    log_info "Rolling back $service_name to image: $backup_image"
    
    if [ "$backup_image" = "none" ]; then
        log_warning "No backup image found for $service_name. Skipping rollback."
        return 0
    fi
    
    # 현재 컨테이너 중지
    docker-compose -f $COMPOSE_FILE --env-file "$ENV_FILE" stop "$service_name" || true
    
    # 백업 이미지로 컨테이너 재시작
    case $service_name in
        "backend")
            IMAGE_TAG_OVERRIDE=$(echo "$backup_image" | cut -d':' -f2)
            REGISTRY_OVERRIDE=$(echo "$backup_image" | cut -d'/' -f1)
            export IMAGE_TAG="$IMAGE_TAG_OVERRIDE"
            export REGISTRY="$REGISTRY_OVERRIDE"
            ;;
        "frontend")
            IMAGE_TAG_OVERRIDE=$(echo "$backup_image" | cut -d':' -f2)
            REGISTRY_OVERRIDE=$(echo "$backup_image" | cut -d'/' -f1)
            export IMAGE_TAG="$IMAGE_TAG_OVERRIDE"
            export REGISTRY="$REGISTRY_OVERRIDE"
            ;;
        "gateway")
            IMAGE_TAG_OVERRIDE=$(echo "$backup_image" | cut -d':' -f2)
            REGISTRY_OVERRIDE=$(echo "$backup_image" | cut -d'/' -f1)
            export IMAGE_TAG="$IMAGE_TAG_OVERRIDE"
            export REGISTRY="$REGISTRY_OVERRIDE"
            ;;
    esac
    
    # 서비스 재시작
    docker-compose -f $COMPOSE_FILE --env-file "$ENV_FILE" up -d --no-deps "$service_name"
    
    # 헬스체크
    sleep 10
    case $service_name in
        "backend")
            if curl -f -s "http://localhost:3001/health" > /dev/null 2>&1; then
                log_success "$service_name rollback successful"
            else
                log_error "$service_name rollback failed health check"
                return 1
            fi
            ;;
        "gateway")
            if curl -f -s "http://localhost/health" > /dev/null 2>&1; then
                log_success "$service_name rollback successful"
            else
                log_error "$service_name rollback failed health check"
                return 1
            fi
            ;;
        *)
            log_success "$service_name rollback completed"
            ;;
    esac
}

# 데이터베이스 롤백 함수
rollback_database() {
    log_warning "Database rollback requested"
    
    BACKUP_DIR="./backups"
    
    if [ ! -d "$BACKUP_DIR" ]; then
        log_error "Backup directory not found: $BACKUP_DIR"
        return 1
    fi
    
    # 최신 백업 파일 찾기
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/db_backup_*.sql 2>/dev/null | head -n1)
    
    if [ -z "$LATEST_BACKUP" ]; then
        log_error "No database backup files found in $BACKUP_DIR"
        return 1
    fi
    
    log_info "Found latest backup: $LATEST_BACKUP"
    
    read -p "Do you want to restore database from $LATEST_BACKUP? This will OVERWRITE current data (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Database rollback cancelled."
        return 0
    fi
    
    # 데이터베이스 복원
    if docker ps | grep -q "woodiecampus-postgres"; then
        log_info "Restoring database..."
        docker exec -i woodiecampus-postgres psql -U postgres -d woodiecampus < "$LATEST_BACKUP"
        log_success "Database restored from $LATEST_BACKUP"
    else
        log_error "PostgreSQL container not found"
        return 1
    fi
}

# 서비스 롤백 수행
log_info "Starting service rollback..."

# 롤백 순서: gateway -> frontend -> backend (배포의 역순)
rollback_service "gateway" "$BACKUP_NGINX_IMAGE"
rollback_service "frontend" "$BACKUP_FRONTEND_IMAGE"
rollback_service "backend" "$BACKUP_BACKEND_IMAGE"

# 데이터베이스 롤백 여부 확인
read -p "Do you also want to rollback the database? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rollback_database
fi

# 전체 시스템 헬스체크
log_info "Performing system health check..."
sleep 30

HEALTH_CHECKS_PASSED=0
TOTAL_HEALTH_CHECKS=2

# Backend 헬스체크
if curl -f -s "http://localhost:3001/health" > /dev/null 2>&1; then
    log_success "Backend health check passed"
    ((HEALTH_CHECKS_PASSED++))
else
    log_error "Backend health check failed"
fi

# Gateway 헬스체크
if curl -f -s "http://localhost/health" > /dev/null 2>&1; then
    log_success "Gateway health check passed"
    ((HEALTH_CHECKS_PASSED++))
else
    log_error "Gateway health check failed"
fi

# 결과 보고
if [ $HEALTH_CHECKS_PASSED -eq $TOTAL_HEALTH_CHECKS ]; then
    log_success "Rollback completed successfully! All services are healthy."
    
    # Slack 알림
    if [ -n "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"⚠️ WoodieCampus rollback to $ENVIRONMENT completed successfully\"}" \
            "$SLACK_WEBHOOK_URL"
    fi
    
    exit 0
else
    log_error "Rollback completed but some services failed health checks ($HEALTH_CHECKS_PASSED/$TOTAL_HEALTH_CHECKS passed)"
    exit 1
fi