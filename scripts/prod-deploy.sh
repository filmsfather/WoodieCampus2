#!/bin/bash

# Deploy production environment
echo "🚀 Deploying WoodieCampus production environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Stop any running development environment
echo "🛑 Stopping development environment..."
docker-compose -f docker-compose.dev.yml down 2>/dev/null || true

# Build and start production services
echo "📦 Building and starting production services..."
docker-compose up --build -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 30

# Check service status
echo "📊 Service Status:"
docker-compose ps

# Show logs
echo "📝 Recent logs:"
docker-compose logs --tail=50

echo ""
echo "✅ Production environment is ready!"
echo "🌐 Application: http://localhost"
echo "🔧 Backend API: http://localhost:3001"
echo ""
echo "💡 Use 'docker-compose logs -f' to follow logs"
echo "💡 Use 'docker-compose down' to stop the production environment"