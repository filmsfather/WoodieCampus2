#!/bin/bash

# Clean development environment (remove containers, networks, volumes)
echo "🧹 Cleaning WoodieCampus development environment..."

docker-compose -f docker-compose.dev.yml down -v --remove-orphans

echo "🗑️  Removing development images..."
docker rmi woodiecampus-backend-dev woodiecampus-frontend-dev 2>/dev/null || true

echo "✅ Development environment cleaned!"
echo "⚠️  All data has been removed. Next start will create fresh databases."