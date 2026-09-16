#!/bin/bash
# Development environment convenience script
# Usage: ./scripts/dev.sh [up|down|logs|build|restart|ps|exec]

set -e

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.dev.yml"

case "$1" in
  up)
    echo "Starting development environment..."
    docker-compose $COMPOSE_FILES up -d
    echo "Development environment started!"
    echo ""
    echo "Services:"
    echo "  - API: http://localhost:5000"
    echo "  - Grafana: http://localhost:3000"
    echo "  - Loki: http://localhost:3100"
    echo "  - MongoDB: localhost:27017"
    echo "  - Redis: localhost:6379"
    echo "  - MongoDB Exporter: http://localhost:9216"
    ;;
  down)
    echo "Stopping development environment..."
    docker-compose $COMPOSE_FILES down
    echo "Development environment stopped!"
    ;;
  logs)
    docker-compose $COMPOSE_FILES logs -f "${@:2}"
    ;;
  build)
    echo "Building development images..."
    docker-compose $COMPOSE_FILES build --no-cache
    echo "Build complete!"
    ;;
  rebuild)
    echo "Rebuilding and restarting development environment..."
    docker-compose $COMPOSE_FILES down
    docker-compose $COMPOSE_FILES build --no-cache
    docker-compose $COMPOSE_FILES up -d
    echo "Rebuild complete!"
    ;;
  restart)
    echo "Restarting development environment..."
    docker-compose $COMPOSE_FILES restart "${@:2}"
    echo "Restart complete!"
    ;;
  ps)
    docker-compose $COMPOSE_FILES ps
    ;;
  exec)
    docker-compose $COMPOSE_FILES exec "${@:2}"
    ;;
  *)
    echo "Usage: $0 {up|down|logs|build|rebuild|restart|ps|exec}"
    echo ""
    echo "Commands:"
    echo "  up       - Start development environment"
    echo "  down     - Stop development environment"
    echo "  logs     - Show logs (add service name for specific service)"
    echo "  build    - Rebuild images"
    echo "  rebuild  - Rebuild and restart everything"
    echo "  restart  - Restart services"
    echo "  ps       - Show running containers"
    echo "  exec     - Execute command in container"
    echo ""
    echo "Examples:"
    echo "  $0 up"
    echo "  $0 logs app"
    echo "  $0 exec app sh"
    exit 1
    ;;
esac
