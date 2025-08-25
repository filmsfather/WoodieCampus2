# WoodieCampus Backend

Node.js + TypeScript + Express backend server for WoodieCampus educational platform.

## Features

- ✅ Express.js server with TypeScript
- ✅ PostgreSQL database with connection pooling
- ✅ Redis cache system
- ✅ Database migration system
- ✅ Winston logging
- ✅ Error handling middleware
- ✅ CORS & Security (Helmet)
- ✅ Health check endpoints

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 12+ (optional - server runs without it)
- Redis 6+ (optional - server runs without it)

## Installation

```bash
npm install
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Server
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=info

# PostgreSQL Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=woodiecampus
DB_USER=postgres
DB_PASSWORD=postgres

# Redis Cache
REDIS_URL=redis://localhost:6379
```

## Database Setup

### Option 1: Using Docker (Recommended)

```bash
# Start PostgreSQL and Redis with Docker
docker run --name postgres-woodie -e POSTGRES_DB=woodiecampus -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15
docker run --name redis-woodie -p 6379:6379 -d redis:7-alpine
```

### Option 2: Local Installation

#### PostgreSQL
```bash
# macOS
brew install postgresql
brew services start postgresql
createdb woodiecampus

# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo -u postgres createdb woodiecampus
```

#### Redis
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt install redis-server
sudo systemctl start redis
```

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and service connectivity.

### API Information
```
GET /api
```
Returns API information and available endpoints.

### Test Endpoints
```
GET /api/test
GET /api/cache/test
```

## Database Migrations

Migrations run automatically on server start when database is connected.

Current migrations:
- `001_create_users_table` - User authentication table
- `002_create_courses_table` - Course information table  
- `003_create_enrollments_table` - User-course enrollment tracking

## Architecture

```
src/
├── config/          # Database, Redis, and logger configuration
├── database/        # Migration system
├── middleware/      # Express middleware (error handling)
├── routes/          # API route handlers
└── server.ts        # Main server file
```

## Development Notes

- Server starts even if PostgreSQL or Redis are unavailable
- Health check endpoint reports individual service status
- Graceful shutdown handling for database and Redis connections
- Automatic database migrations on startup
- Request logging and structured error handling

## Scripts

- `npm run dev` - Development mode with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run test` - Run tests (not implemented yet)

## Service Status

The application will report service status via `/health`:
- `OK` - All services connected
- `PARTIAL` - Some services unavailable
- Individual service status in response body