#!/bin/bash

# Stop development environment
echo "🛑 Stopping WoodieCampus development environment..."

docker-compose -f docker-compose.dev.yml down

echo "✅ Development environment stopped!"
echo "💡 Data volumes are preserved. Use './scripts/dev-clean.sh' to remove all data."