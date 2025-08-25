# WoodieCampus

Educational platform with real-time communication features.

![CI/CD Pipeline](https://github.com/filmsfather/WoodieCampus2/workflows/CI/CD%20Pipeline/badge.svg)
![License](https://img.shields.io/github/license/filmsfather/WoodieCampus2)

Full-stack educational platform built with React + TypeScript frontend and Node.js + PostgreSQL backend.

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose
- Git

### Development Environment

1. **Clone the repository**
```bash
git clone <repository-url>
cd WoodieCampus
```

2. **Start development environment**
```bash
./scripts/dev-start.sh
```

This will:
- Start PostgreSQL database
- Start Redis cache  
- Build and run backend API server
- Build and run frontend development server

**Services will be available at:**
- 🌐 Frontend: http://localhost:5173
- 🔧 Backend API: http://localhost:3001
- 🗄️ PostgreSQL: localhost:5432
- 🔴 Redis: localhost:6379

3. **Stop development environment**
```bash
./scripts/dev-stop.sh
```

4. **Clean development environment** (removes all data)
```bash
./scripts/dev-clean.sh
```

### Production Deployment

```bash
./scripts/prod-deploy.sh
```

Production services:
- 🌐 Application: http://localhost
- 🔧 Backend API: http://localhost:3001

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React App     │────│   Node.js API   │────│   PostgreSQL    │
│   (Frontend)    │    │   (Backend)     │    │   (Database)    │
│   Port: 5173    │    │   Port: 3001    │    │   Port: 5432    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                       ┌─────────────────┐
                       │      Redis      │
                       │     (Cache)     │
                       │   Port: 6379    │
                       └─────────────────┘
```

## 📁 Project Structure

```
WoodieCampus/
├── frontend/                 # React TypeScript application
│   ├── src/
│   ├── Dockerfile           # Production frontend container
│   ├── Dockerfile.dev       # Development frontend container
│   └── nginx.conf           # Nginx configuration
├── backend/                 # Node.js TypeScript API
│   ├── src/
│   ├── Dockerfile           # Production backend container
│   └── Dockerfile.dev       # Development backend container
├── scripts/                 # Docker management scripts
├── docker-compose.yml       # Production orchestration
├── docker-compose.dev.yml   # Development orchestration
└── docker-compose.override.yml
```

## 🛠️ Development

### Manual Development (without Docker)

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Backend:**
```bash
cd backend
npm install
npm run dev
```

**Prerequisites for manual development:**
- Node.js 18+
- PostgreSQL 12+
- Redis 6+

### Docker Commands

**View logs:**
```bash
# Development
docker-compose -f docker-compose.dev.yml logs -f

# Production  
docker-compose logs -f
```

**Restart services:**
```bash
# Development
docker-compose -f docker-compose.dev.yml restart

# Production
docker-compose restart
```

**Execute commands in containers:**
```bash
# Backend shell
docker-compose exec backend sh

# Frontend shell  
docker-compose exec frontend sh

# Database access
docker-compose exec postgres psql -U postgres -d woodiecampus
```

## 🔧 Configuration

### Environment Variables

**Backend (.env):**
```env
NODE_ENV=development
PORT=3001
DB_HOST=postgres
DB_NAME=woodiecampus
DB_USER=postgres
DB_PASSWORD=postgres
REDIS_URL=redis://redis:6379
```

**Frontend:**
```env
VITE_API_URL=http://localhost:3001
```

### Database

- **Development:** PostgreSQL runs in Docker container
- **Migrations:** Run automatically on backend startup
- **Data:** Persisted in Docker volumes

### Cache

- **Redis:** Session storage and application cache
- **Development:** Runs in Docker container
- **Data:** Persisted in Docker volumes

## 🚦 Health Checks

All services include health checks:

**Backend API:** `GET /health`
```json
{
  "status": "OK",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

**Frontend:** `GET /health` (via nginx)

## 📊 Monitoring

**Service Status:**
```bash
docker-compose ps
```

**Resource Usage:**
```bash
docker stats
```

**Service Logs:**
```bash
# All services
docker-compose logs

# Specific service
docker-compose logs backend
```

## 🔒 Security

- Non-root containers
- Security headers (Helmet.js)
- CORS configuration
- Environment variable isolation
- Network segmentation

## 🧪 Testing

```bash
# Frontend tests
cd frontend
npm run test

# Backend tests (when implemented)
cd backend  
npm run test
```

## 📝 API Documentation

Backend API endpoints:

- `GET /health` - Health check
- `GET /api` - API information
- `GET /api/test` - API test endpoint
- `GET /api/cache/test` - Redis cache test

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📜 License

This project is licensed under the MIT License.