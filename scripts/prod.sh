#!/bin/bash
# Production environment convenience script
# Usage: ./scripts/prod.sh [up|down|logs|build|restart|ps|exec|backup]

set -e

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"

# Check if .env.prod exists
if [ ! -f .env.prod ]; then
  echo "ERROR: .env.prod file not found!"
  echo "Please create .env.prod with production configuration."
  echo "You can use .env.example as template."
  exit 1
fi

case "$1" in
  up)
    echo "Starting production environment..."
    docker-compose $COMPOSE_FILES up -d
    echo "Production environment started!"
    echo ""
    echo "Services:"
    echo "  - API: http://localhost:5000"
    echo "  - Grafana: http://localhost:3000"
    echo "  - Loki: http://localhost:3100"
    echo "  - MongoDB Exporter: http://localhost:9216"
    echo ""
    echo "Remember to:"
    echo "  - Configure firewall rules"
    echo "  - Set up SSL/TLS certificates"
    echo "  - Configure backup strategy"
    ;;
  down)
    echo "Stopping production environment..."
    docker-compose $COMPOSE_FILES down
    echo "Production environment stopped!"
    ;;
  logs)
    docker-compose $COMPOSE_FILES logs -f "${@:2}"
    ;;
  build)
    echo "Building production images..."
    docker-compose $COMPOSE_FILES build --no-cache
    echo "Build complete!"
    ;;
  rebuild)
    echo "Rebuilding and restarting production environment..."
    docker-compose $COMPOSE_FILES down
    docker-compose $COMPOSE_FILES build --no-cache
    docker-compose $COMPOSE_FILES up -d
    echo "Rebuild complete!"
    ;;
  restart)
    echo "Restarting production environment..."
    docker-compose $COMPOSE_FILES restart "${@:2}"
    echo "Restart complete!"
    ;;
  ps)
    docker-compose $COMPOSE_FILES ps
    ;;
  exec)
    docker-compose $COMPOSE_FILES exec "${@:2}"
    ;;
  backup)
    echo "Creating MongoDB backup..."
    BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    docker-compose $COMPOSE_FILES exec -T mongo_db mongodump --archive > "$BACKUP_DIR/mongodb-backup.archive"
    echo "Backup created at $BACKUP_DIR/mongodb-backup.archive"
    ;;
  health)
    echo "Checking health status..."
    docker-compose $COMPOSE_FILES ps
    echo ""
    echo "API health check:"
    curl -s http://localhost:5000/health || echo "API not responding"
    ;;
  *)
    echo "Usage: $0 {up|down|logs|build|rebuild|restart|ps|exec|backup|health}"
    echo ""
    echo "Commands:"
    echo "  up       - Start production environment"
    echo "  down     - Stop production environment"
    echo "  logs     - Show logs (add service name for specific service)"
    echo "  build    - Rebuild images"
    echo "  rebuild  - Rebuild and restart everything"
    echo "  restart  - Restart services"
    echo "  ps       - Show running containers"
    echo "  exec     - Execute command in container"
    echo "  backup   - Create MongoDB backup"
    echo "  health   - Check service health"
    echo ""
    echo "Examples:"
    echo "  $0 up"
    echo "  $0 logs app"
    echo "  $0 backup"
    echo "  $0 health"
    exit 1
    ;;
esac
