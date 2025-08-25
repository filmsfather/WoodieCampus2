#!/bin/bash

# Start development environment
echo "🚀 Starting WoodieCampus development environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Build and start services
echo "📦 Building and starting services..."
docker-compose -f docker-compose.dev.yml up --build -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service status
echo "📊 Service Status:"
docker-compose -f docker-compose.dev.yml ps

# Show logs
echo "📝 Recent logs:"
docker-compose -f docker-compose.dev.yml logs --tail=50

echo ""
echo "✅ Development environment is ready!"
echo "🌐 Frontend: http://localhost:5173"
echo "🔧 Backend API: http://localhost:3001"
echo "🗄️  PostgreSQL: localhost:5432"
echo "🔴 Redis: localhost:6379"
echo ""
echo "💡 Use 'docker-compose -f docker-compose.dev.yml logs -f' to follow logs"
echo "💡 Use './scripts/dev-stop.sh' to stop the development environment"