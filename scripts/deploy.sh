#!/bin/bash

# WoodieCampus 배포 스크립트
# 사용법: ./deploy.sh [환경] [이미지_태그]
# 예시: ./deploy.sh production abc1234

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
IMAGE_TAG=${2:-latest}
REGISTRY=${REGISTRY:-ghcr.io}
PROJECT_NAME="woodiecampus"

# 환경 검증
if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
    log_error "Invalid environment: $ENVIRONMENT. Use 'staging' or 'production'"
    exit 1
fi

log_info "Starting deployment to $ENVIRONMENT environment with image tag: $IMAGE_TAG"

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

# 환경 파일 확인
if [ ! -f "$ENV_FILE" ]; then
    log_warning "Environment file $ENV_FILE not found. Creating from template..."
    if [ -f ".env.example" ]; then
        cp .env.example "$ENV_FILE"
        log_info "Please update $ENV_FILE with appropriate values"
    else
        log_error "No .env.example file found. Please create $ENV_FILE manually"
        exit 1
    fi
fi

# Docker 및 Docker Compose 확인
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    log_error "Docker Compose is not installed"
    exit 1
fi

# 환경 변수 로드
log_info "Loading environment variables from $ENV_FILE"
export $(grep -v '^#' "$ENV_FILE" | xargs)
export IMAGE_TAG="$IMAGE_TAG"
export REGISTRY="$REGISTRY"

# 이전 컨테이너 백업 (프로덕션인 경우)
if [ "$ENVIRONMENT" = "production" ]; then
    log_info "Creating backup of current deployment..."
    
    # 현재 실행 중인 컨테이너 이미지 태그 백업
    CURRENT_BACKEND_IMAGE=$(docker inspect woodiecampus-backend --format='{{.Config.Image}}' 2>/dev/null || echo "none")
    CURRENT_FRONTEND_IMAGE=$(docker inspect woodiecampus-frontend --format='{{.Config.Image}}' 2>/dev/null || echo "none")
    CURRENT_NGINX_IMAGE=$(docker inspect woodiecampus-gateway --format='{{.Config.Image}}' 2>/dev/null || echo "none")
    
    echo "$CURRENT_BACKEND_IMAGE" > .backup_backend_image
    echo "$CURRENT_FRONTEND_IMAGE" > .backup_frontend_image  
    echo "$CURRENT_NGINX_IMAGE" > .backup_nginx_image
    
    log_info "Backup completed. Current images saved to .backup_* files"
fi

# 데이터베이스 백업 (프로덕션인 경우)
if [ "$ENVIRONMENT" = "production" ]; then
    log_info "Creating database backup..."
    
    BACKUP_DIR="./backups"
    mkdir -p "$BACKUP_DIR"
    
    BACKUP_FILE="$BACKUP_DIR/db_backup_$(date +%Y%m%d_%H%M%S).sql"
    
    if docker ps | grep -q "woodiecampus-postgres"; then
        docker exec woodiecampus-postgres pg_dump -U postgres woodiecampus > "$BACKUP_FILE"
        log_success "Database backup created: $BACKUP_FILE"
    else
        log_warning "PostgreSQL container not found. Skipping database backup."
    fi
fi

# Docker 이미지 풀
log_info "Pulling Docker images..."

docker pull "$REGISTRY/filmsfather/woodiecampus-backend:$IMAGE_TAG"
docker pull "$REGISTRY/filmsfather/woodiecampus-frontend:$IMAGE_TAG"  
docker pull "$REGISTRY/filmsfather/woodiecampus-nginx:$IMAGE_TAG"

log_success "Images pulled successfully"

# 헬스체크 함수
check_service_health() {
    local service_name=$1
    local health_url=$2
    local max_attempts=30
    local attempt=1
    
    log_info "Waiting for $service_name to be healthy..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "$health_url" > /dev/null 2>&1; then
            log_success "$service_name is healthy"
            return 0
        fi
        
        log_info "Attempt $attempt/$max_attempts: $service_name not ready yet..."
        sleep 10
        ((attempt++))
    done
    
    log_error "$service_name failed health check after $max_attempts attempts"
    return 1
}

# 롤링 배포 수행
log_info "Starting rolling deployment..."

# 데이터베이스 마이그레이션 실행
log_info "Running database migrations..."
if docker-compose -f $COMPOSE_FILE --env-file "$ENV_FILE" run --rm backend npx prisma migrate deploy; then
    log_success "Database migrations completed"
else
    log_error "Database migration failed"
    exit 1
fi

# 서비스별 롤링 업데이트
services=("backend" "frontend" "gateway")

for service in "${services[@]}"; do
    log_info "Updating $service service..."
    
    # 새 컨테이너 시작
    docker-compose -f $COMPOSE_FILE --env-file "$ENV_FILE" up -d --no-deps "$service"
    
    # 헬스체크 수행
    case $service in
        "backend")
            check_service_health "$service" "http://localhost:3001/health"
            ;;
        "gateway")
            check_service_health "$service" "http://localhost/health"
            ;;
    esac
    
    if [ $? -eq 0 ]; then
        log_success "$service updated successfully"
    else
        log_error "$service update failed"
        
        # 롤백 수행
        if [ "$ENVIRONMENT" = "production" ]; then
            log_warning "Rolling back $service..."
            # 롤백 로직은 별도 함수로 구현
            rollback_service "$service"
        fi
        exit 1
    fi
done

# 불필요한 이미지 정리
log_info "Cleaning up old images..."
docker image prune -f
docker system prune -f

log_success "Deployment completed successfully!"

# 배포 완료 알림
log_info "Deployment Summary:"
log_info "  Environment: $ENVIRONMENT"
log_info "  Image Tag: $IMAGE_TAG"
log_info "  Backend: $REGISTRY/filmsfather/woodiecampus-backend:$IMAGE_TAG"
log_info "  Frontend: $REGISTRY/filmsfather/woodiecampus-frontend:$IMAGE_TAG"
log_info "  Nginx: $REGISTRY/filmsfather/woodiecampus-nginx:$IMAGE_TAG"

# Slack 알림 (환경변수가 설정된 경우)
if [ -n "$SLACK_WEBHOOK_URL" ]; then
    curl -X POST -H 'Content-type: application/json' \
        --data "{\"text\":\"🚀 WoodieCampus deployment to $ENVIRONMENT completed successfully\\nImage tag: $IMAGE_TAG\"}" \
        "$SLACK_WEBHOOK_URL"
fi

exit 0