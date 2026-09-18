DOCKER_COMPOSE := docker compose
COMPOSE_DEV := -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_PROD := -f docker-compose.yml -f docker-compose.prod.yml

# ANSI color codes
CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
BLUE := \033[0;34m
MAGENTA := \033[0;35m
RESET := \033[0m

.DEFAULT_GOAL := help

###################
# Help
###################

.PHONY: help
help:
	@echo ""
	@echo "$(BLUE)Development Commands:$(RESET)"
	@echo "  $(GREEN)make dev-up$(RESET)       - Start development environment"
	@echo "  $(GREEN)make dev-down$(RESET)     - Stop development environment"
	@echo "  $(GREEN)make dev-build$(RESET)    - Build development images"
	@echo "  $(GREEN)make dev-rebuild$(RESET)  - Rebuild and restart development"
	@echo "  $(GREEN)make dev-logs$(RESET)     - Show development logs (SERVICE=app)"
	@echo "  $(GREEN)make dev-ps$(RESET)       - Show development containers"
	@echo "  $(GREEN)make dev-restart$(RESET)  - Restart development services"
	@echo "  $(GREEN)make dev-exec$(RESET)     - Execute command (SERVICE=app CMD=sh)"
	@echo ""
	@echo "$(MAGENTA)Production Commands:$(RESET)"
	@echo "  $(GREEN)make prod-up$(RESET)      - Start production environment"
	@echo "  $(GREEN)make prod-down$(RESET)    - Stop production environment"
	@echo "  $(GREEN)make prod-build$(RESET)   - Build production images"
	@echo "  $(GREEN)make prod-rebuild$(RESET) - Rebuild and restart production"
	@echo "  $(GREEN)make prod-logs$(RESET)    - Show production logs (SERVICE=app)"
	@echo "  $(GREEN)make prod-ps$(RESET)      - Show production containers"
	@echo "  $(GREEN)make prod-restart$(RESET) - Restart production services"
	@echo "  $(GREEN)make prod-backup$(RESET)  - Backup MongoDB"
	@echo "  $(GREEN)make prod-health$(RESET)  - Check service health"
	@echo ""
	@echo "$(YELLOW)General Commands:$(RESET)"
	@echo "  $(GREEN)make prune$(RESET)        - Remove dangling Docker images"
	@echo "  $(GREEN)make clean$(RESET)        - Remove all dangling images"
	@echo ""

###################
# Development
###################

.PHONY: dev-up
dev-up:
	@echo "$(CYAN)Starting development environment...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) up -d
	@echo "$(GREEN)Development environment started!$(RESET)"
	@echo ""
	@echo "$(BLUE)Services:$(RESET)"
	@echo "  $(YELLOW)API:$(RESET)              http://localhost:5000"
	@echo "  $(YELLOW)Grafana:$(RESET)          http://localhost:3000"
	@echo "  $(YELLOW)Loki:$(RESET)             http://localhost:3100"
	@echo "  $(YELLOW)MongoDB:$(RESET)          localhost:27017"
	@echo "  $(YELLOW)Redis:$(RESET)            localhost:6379"
	@echo "  $(YELLOW)MongoDB Exporter:$(RESET) http://localhost:9216"
	@echo ""

.PHONY: dev-down
dev-down:
	@echo "$(YELLOW)Stopping development environment...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) down $(FLAGS)
	@echo "$(GREEN)Development environment stopped!$(RESET)"

.PHONY: dev-build
dev-build:
	@echo "$(CYAN)Building development images...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) build --no-cache
	@echo "$(GREEN)Build complete!$(RESET)"

.PHONY: dev-rebuild
dev-rebuild: dev-down dev-build dev-up
	@echo "$(GREEN)Development environment rebuilt!$(RESET)"

.PHONY: dev-logs
dev-logs:
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) logs -f $(SERVICE)

.PHONY: dev-ps
dev-ps:
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) ps

.PHONY: dev-restart
dev-restart:
	@echo "$(CYAN)Restarting development services...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) restart $(SERVICE)
	@echo "$(GREEN)Restart complete!$(RESET)"

.PHONY: dev-exec
dev-exec:
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) exec $(SERVICE) $(CMD)

###################
# Production
###################

.PHONY: prod-check-env
prod-check-env:
	@if [ ! -f .env.prod ]; then \
		echo "$(RED)ERROR: .env.prod file not found!$(RESET)"; \
		echo "Please create .env.prod with production configuration."; \
		echo "You can use .env.example as template."; \
		exit 1; \
	fi

.PHONY: prod-up
prod-up: prod-check-env
	@echo "$(CYAN)Starting production environment...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) up -d
	@echo "$(GREEN)Production environment started!$(RESET)"
	@echo ""
	@echo "$(BLUE)Services:$(RESET)"
	@echo "  $(YELLOW)API:$(RESET)              http://localhost:5000"
	@echo "  $(YELLOW)Grafana:$(RESET)          http://localhost:3000"
	@echo "  $(YELLOW)Loki:$(RESET)             http://localhost:3100"
	@echo "  $(YELLOW)MongoDB Exporter:$(RESET) http://localhost:9216"
	@echo ""
	@echo "$(YELLOW)Remember to:$(RESET)"
	@echo "  - Configure firewall rules"
	@echo "  - Set up SSL/TLS certificates"
	@echo "  - Configure backup strategy"
	@echo ""

.PHONY: prod-down
prod-down:
	@echo "$(YELLOW)Stopping production environment...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) down $(FLAGS)
	@echo "$(GREEN)Production environment stopped!$(RESET)"

.PHONY: prod-build
prod-build: prod-check-env
	@echo "$(CYAN)Building production images...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) build --no-cache
	@echo "$(GREEN)Build complete!$(RESET)"

.PHONY: prod-rebuild
prod-rebuild: prod-down prod-build prod-up
	@echo "$(GREEN)Production environment rebuilt!$(RESET)"

.PHONY: prod-logs
prod-logs:
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) logs -f $(SERVICE)

.PHONY: prod-ps
prod-ps:
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) ps

.PHONY: prod-restart
prod-restart:
	@echo "$(CYAN)Restarting production services...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) restart $(SERVICE)
	@echo "$(GREEN)Restart complete!$(RESET)"

.PHONY: prod-backup
prod-backup:
	@echo "$(CYAN)Creating MongoDB backup...$(RESET)"
	@mkdir -p ./backups
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) exec -T mongo_db mongodump --archive > ./backups/mongodb-backup-$$(date +%Y%m%d_%H%M%S).archive
	@echo "$(GREEN)Backup created in ./backups/$(RESET)"

.PHONY: prod-health
prod-health:
	@echo "$(CYAN)Checking health status...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) ps
	@echo ""
	@echo "$(BLUE)API health check:$(RESET)"
	@curl -s http://localhost:5000/health || echo "$(RED)API not responding$(RESET)"

###################
# General
###################

.PHONY: prune
prune:
	@echo "$(CYAN)Removing dangling Docker images...$(RESET)"
	@docker image prune -f
	@echo "$(GREEN)Dangling images removed!$(RESET)"

.PHONY: clean
clean:
	@echo "$(CYAN)Removing dangling images...$(RESET)"
	@dangling=$$(docker images -f "dangling=true" -q); \
	if [ -n "$$dangling" ]; then \
		docker rmi $$dangling; \
		echo "$(GREEN)Dangling images removed!$(RESET)"; \
	else \
		echo "$(YELLOW)No dangling images to remove.$(RESET)"; \
	fi
