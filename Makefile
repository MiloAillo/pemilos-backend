DOCKER_COMPOSE := docker compose
COMPOSE_DEV := --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_PROD := --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml

# ANSI color codes
CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
BLUE := \033[0;34m
MAGENTA := \033[0;35m
RESET := \033[0m

# Default flag values
CACHE ?= 1
FOLLOW ?= 1
REMOVE_ORPHANS ?= 1
TIMEOUT ?= 10
WAIT ?= 0
BUILD ?= 0
FORCE ?= 0
RENEW_VOLUMES ?= 0
VOLUMES ?= 0
ALL ?= 0
QUIET ?= 0
TIMESTAMPS ?= 0
NO_COLOR ?= 0
NO_DEPS ?= 0
NO_TTY ?= 0
DETACH ?= 0
PULL_FLAG ?= policy

.DEFAULT_GOAL := help

###################
# Help
###################

.PHONY: help
help:
	@echo ""
	@echo "$(BLUE)Development Commands:$(RESET)"
	@echo "  $(GREEN)make dev-up$(RESET)        - Start development environment"
	@echo "  $(GREEN)make dev-down$(RESET)      - Stop and remove development containers"
	@echo "  $(GREEN)make dev-stop$(RESET)      - Stop containers (preserve state)"
	@echo "  $(GREEN)make dev-start$(RESET)     - Start stopped containers"
	@echo "  $(GREEN)make dev-restart$(RESET)   - Restart services"
	@echo "  $(GREEN)make dev-pause$(RESET)     - Pause running containers"
	@echo "  $(GREEN)make dev-unpause$(RESET)   - Resume paused containers"
	@echo "  $(GREEN)make dev-build$(RESET)     - Build images"
	@echo "  $(GREEN)make dev-rebuild$(RESET)   - Rebuild and restart"
	@echo "  $(GREEN)make dev-pull$(RESET)      - Pull latest images"
	@echo "  $(GREEN)make dev-logs$(RESET)      - Show logs"
	@echo "  $(GREEN)make dev-ps$(RESET)        - Show containers"
	@echo "  $(GREEN)make dev-stats$(RESET)     - Show resource usage"
	@echo "  $(GREEN)make dev-top$(RESET)       - Show running processes"
	@echo "  $(GREEN)make dev-exec$(RESET)      - Execute command in container"
	@echo ""
	@echo "$(MAGENTA)Production Commands:$(RESET)"
	@echo "  $(GREEN)make prod-up$(RESET)       - Start production environment"
	@echo "  $(GREEN)make prod-down$(RESET)     - Stop and remove production containers"
	@echo "  $(GREEN)make prod-stop$(RESET)     - Stop containers (preserve state)"
	@echo "  $(GREEN)make prod-start$(RESET)    - Start stopped containers"
	@echo "  $(GREEN)make prod-restart$(RESET)  - Restart services"
	@echo "  $(GREEN)make prod-pause$(RESET)    - Pause running containers"
	@echo "  $(GREEN)make prod-unpause$(RESET)  - Resume paused containers"
	@echo "  $(GREEN)make prod-build$(RESET)    - Build images"
	@echo "  $(GREEN)make prod-rebuild$(RESET)  - Rebuild and restart"
	@echo "  $(GREEN)make prod-pull$(RESET)     - Pull latest images"
	@echo "  $(GREEN)make prod-logs$(RESET)     - Show logs"
	@echo "  $(GREEN)make prod-ps$(RESET)       - Show containers"
	@echo "  $(GREEN)make prod-stats$(RESET)    - Show resource usage"
	@echo "  $(GREEN)make prod-top$(RESET)      - Show running processes"
	@echo "  $(GREEN)make prod-backup$(RESET)   - Backup MongoDB"
	@echo "  $(GREEN)make prod-health$(RESET)   - Check service health"
	@echo ""
	@echo "$(YELLOW)General Commands:$(RESET)"
	@echo "  $(GREEN)make prune$(RESET)         - Remove dangling Docker images"
	@echo "  $(GREEN)make clean$(RESET)         - Remove all dangling images"
	@echo ""
	@echo "$(YELLOW)Flag Examples:$(RESET)"
	@echo "  $(GREEN)make dev-up BUILD=1$(RESET)              - Build before starting"
	@echo "  $(GREEN)make dev-up WAIT=1$(RESET)               - Wait for healthy services"
	@echo "  $(GREEN)make dev-logs TAIL=100$(RESET)           - Show last 100 lines"
	@echo "  $(GREEN)make dev-logs SINCE=10m$(RESET)          - Show logs from last 10 min"
	@echo "  $(GREEN)make dev-logs TIMESTAMPS=1$(RESET)      - Show timestamps"
	@echo "  $(GREEN)make dev-build CACHE=0$(RESET)           - Build without cache"
	@echo "  $(GREEN)make dev-down VOLUMES=1$(RESET)          - Remove volumes too"
	@echo "  $(GREEN)make dev-ps ALL=1$(RESET)                - Show all containers"
	@echo "  $(GREEN)make dev-ps STATUS=running$(RESET)       - Filter by status"
	@echo "  $(GREEN)make dev-exec SERVICE=app CMD=sh$(RESET) - Shell into app"
	@echo "  $(GREEN)make dev-exec USER=root CMD=sh$(RESET)   - Shell as root"
	@echo ""

###################
# Development
###################

.PHONY: dev-up
dev-up:
	@echo "$(CYAN)Starting development environment...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) up -d \
		$(if $(filter 1,$(BUILD)),--build) \
		$(if $(filter-out policy,$(PULL_FLAG)),--pull $(PULL_FLAG)) \
		$(if $(filter 1,$(FORCE)),--force-recreate) \
		$(if $(filter 1,$(RENEW_VOLUMES)),--renew-anon-volumes) \
		$(if $(filter 1,$(WAIT)),--wait) \
		$(if $(filter 1,$(REMOVE_ORPHANS)),--remove-orphans) \
		$(SERVICE)
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
	@echo "$(YELLOW)Stopping and removing development environment...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) down \
		$(if $(filter 1,$(VOLUMES)),-v) \
		$(if $(IMAGES),--rmi $(IMAGES)) \
		$(if $(TIMEOUT),-t $(TIMEOUT)) \
		$(if $(filter 1,$(REMOVE_ORPHANS)),--remove-orphans) \
		$(SERVICE)
	@echo "$(GREEN)Development environment stopped and removed!$(RESET)"

.PHONY: dev-stop
dev-stop:
	@echo "$(YELLOW)Stopping development containers (preserving state)...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) stop \
		$(if $(TIMEOUT),-t $(TIMEOUT)) \
		$(SERVICE)
	@echo "$(GREEN)Containers stopped (use 'make dev-start' to resume)$(RESET)"

.PHONY: dev-start
dev-start:
	@echo "$(CYAN)Starting stopped development containers...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) start \
		$(if $(filter 1,$(WAIT)),--wait) \
		$(SERVICE)
	@echo "$(GREEN)Containers started!$(RESET)"

.PHONY: dev-restart
dev-restart:
	@echo "$(CYAN)Restarting development services...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) restart \
		$(if $(TIMEOUT),-t $(TIMEOUT)) \
		$(if $(filter 1,$(NO_DEPS)),--no-deps) \
		$(SERVICE)
	@echo "$(GREEN)Restart complete!$(RESET)"

.PHONY: dev-pause
dev-pause:
	@echo "$(YELLOW)Pausing development containers...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) pause $(SERVICE)
	@echo "$(GREEN)Containers paused (use 'make dev-unpause' to resume)$(RESET)"

.PHONY: dev-unpause
dev-unpause:
	@echo "$(CYAN)Resuming development containers...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) unpause $(SERVICE)
	@echo "$(GREEN)Containers resumed!$(RESET)"

.PHONY: dev-build
dev-build:
	@echo "$(CYAN)Building development images...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) build \
		$(if $(filter 0,$(CACHE)),--no-cache) \
		$(if $(filter 1,$(PULL)),--pull) \
		$(if $(filter 1,$(QUIET)),-q) \
		$(SERVICE)
	@echo "$(GREEN)Build complete!$(RESET)"

.PHONY: dev-rebuild
dev-rebuild: dev-down dev-build dev-up
	@echo "$(GREEN)Development environment rebuilt!$(RESET)"

.PHONY: dev-pull
dev-pull:
	@echo "$(CYAN)Pulling latest development images...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) pull \
		$(if $(filter 1,$(QUIET)),-q) \
		$(SERVICE)
	@echo "$(GREEN)Images pulled!$(RESET)"

.PHONY: dev-logs
dev-logs:
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) logs \
		$(if $(filter 0,$(FOLLOW)),,-f) \
		$(if $(TAIL),-n $(TAIL)) \
		$(if $(SINCE),--since $(SINCE)) \
		$(if $(UNTIL),--until $(UNTIL)) \
		$(if $(filter 1,$(TIMESTAMPS)),-t) \
		$(if $(filter 1,$(NO_COLOR)),--no-color) \
		$(SERVICE)

.PHONY: dev-ps
dev-ps:
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) ps \
		$(if $(filter 1,$(ALL)),-a) \
		$(if $(STATUS),--status $(STATUS)) \
		$(if $(filter 1,$(QUIET)),-q) \
		$(if $(FORMAT),--format $(FORMAT)) \
		$(SERVICE)

.PHONY: dev-stats
dev-stats:
	@echo "$(CYAN)Showing resource usage...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) stats $(SERVICE)

.PHONY: dev-top
dev-top:
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) top $(SERVICE)

.PHONY: dev-exec
dev-exec:
	@$(DOCKER_COMPOSE) $(COMPOSE_DEV) exec \
		$(if $(USER),-u $(USER)) \
		$(if $(WORKDIR),-w $(WORKDIR)) \
		$(if $(filter 1,$(DETACH)),-d) \
		$(if $(filter 1,$(NO_TTY)),-T) \
		$(SERVICE) $(CMD)

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
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) up -d \
		$(if $(filter 1,$(BUILD)),--build) \
		$(if $(filter-out policy,$(PULL_FLAG)),--pull $(PULL_FLAG)) \
		$(if $(filter 1,$(FORCE)),--force-recreate) \
		$(if $(filter 1,$(RENEW_VOLUMES)),--renew-anon-volumes) \
		$(if $(filter 1,$(WAIT)),--wait) \
		$(if $(filter 1,$(REMOVE_ORPHANS)),--remove-orphans) \
		$(SERVICE)
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
	@echo "$(YELLOW)Stopping and removing production environment...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) down \
		$(if $(filter 1,$(VOLUMES)),-v) \
		$(if $(IMAGES),--rmi $(IMAGES)) \
		$(if $(TIMEOUT),-t $(TIMEOUT)) \
		$(if $(filter 1,$(REMOVE_ORPHANS)),--remove-orphans) \
		$(SERVICE)
	@echo "$(GREEN)Production environment stopped and removed!$(RESET)"

.PHONY: prod-stop
prod-stop:
	@echo "$(YELLOW)Stopping production containers (preserving state)...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) stop \
		$(if $(TIMEOUT),-t $(TIMEOUT)) \
		$(SERVICE)
	@echo "$(GREEN)Containers stopped (use 'make prod-start' to resume)$(RESET)"

.PHONY: prod-start
prod-start:
	@echo "$(CYAN)Starting stopped production containers...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) start \
		$(if $(filter 1,$(WAIT)),--wait) \
		$(SERVICE)
	@echo "$(GREEN)Containers started!$(RESET)"

.PHONY: prod-restart
prod-restart:
	@echo "$(CYAN)Restarting production services...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) restart \
		$(if $(TIMEOUT),-t $(TIMEOUT)) \
		$(if $(filter 1,$(NO_DEPS)),--no-deps) \
		$(SERVICE)
	@echo "$(GREEN)Restart complete!$(RESET)"

.PHONY: prod-pause
prod-pause:
	@echo "$(YELLOW)Pausing production containers...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) pause $(SERVICE)
	@echo "$(GREEN)Containers paused (use 'make prod-unpause' to resume)$(RESET)"

.PHONY: prod-unpause
prod-unpause:
	@echo "$(CYAN)Resuming production containers...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) unpause $(SERVICE)
	@echo "$(GREEN)Containers resumed!$(RESET)"

.PHONY: prod-build
prod-build: prod-check-env
	@echo "$(CYAN)Building production images...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) build \
		$(if $(filter 0,$(CACHE)),--no-cache) \
		$(if $(filter 1,$(PULL)),--pull) \
		$(if $(filter 1,$(QUIET)),-q) \
		$(SERVICE)
	@echo "$(GREEN)Build complete!$(RESET)"

.PHONY: prod-rebuild
prod-rebuild: prod-down prod-build prod-up
	@echo "$(GREEN)Production environment rebuilt!$(RESET)"

.PHONY: prod-pull
prod-pull:
	@echo "$(CYAN)Pulling latest production images...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) pull \
		$(if $(filter 1,$(QUIET)),-q) \
		$(SERVICE)
	@echo "$(GREEN)Images pulled!$(RESET)"

.PHONY: prod-logs
prod-logs:
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) logs \
		$(if $(filter 0,$(FOLLOW)),,-f) \
		$(if $(TAIL),-n $(TAIL)) \
		$(if $(SINCE),--since $(SINCE)) \
		$(if $(UNTIL),--until $(UNTIL)) \
		$(if $(filter 1,$(TIMESTAMPS)),-t) \
		$(if $(filter 1,$(NO_COLOR)),--no-color) \
		$(SERVICE)

.PHONY: prod-ps
prod-ps:
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) ps \
		$(if $(filter 1,$(ALL)),-a) \
		$(if $(STATUS),--status $(STATUS)) \
		$(if $(filter 1,$(QUIET)),-q) \
		$(if $(FORMAT),--format $(FORMAT)) \
		$(SERVICE)

.PHONY: prod-stats
prod-stats:
	@echo "$(CYAN)Showing resource usage...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) stats $(SERVICE)

.PHONY: prod-top
prod-top:
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) top $(SERVICE)

.PHONY: prod-backup
prod-backup:
	@echo "$(CYAN)Creating MongoDB backup...$(RESET)"
	@mkdir -p ./backups
	@MONGODB_USER=$$(grep ^MONGODB_ROOT_USER .env.prod | cut -d '=' -f2- | tr -d '\r'); \
	MONGODB_PASS=$$(grep ^MONGODB_ROOT_PASSWORD .env.prod | cut -d '=' -f2- | tr -d '\r'); \
	$(DOCKER_COMPOSE) $(COMPOSE_PROD) exec -T mongo_db mongodump \
		--authenticationDatabase admin \
		--username "$$MONGODB_USER" \
		--password "$$MONGODB_PASS" \
		--archive > ./backups/mongodb-backup-$$(date +%Y%m%d_%H%M%S).archive && \
	echo "$(GREEN)Backup created in ./backups/$(RESET)" || \
	{ echo "$(RED)Backup failed$(RESET)"; exit 1; }

.PHONY: prod-health
prod-health:
	@echo "$(CYAN)Checking health status...$(RESET)"
	@$(DOCKER_COMPOSE) $(COMPOSE_PROD) ps
	@echo ""
	@echo "$(BLUE)API health check:$(RESET)"
	@APP_PORT_EXT=$$(grep ^APP_PORT_EXTERNAL .env.prod | cut -d '=' -f2- | tr -d '\r'); \
	APP_PORT_EXT=$${APP_PORT_EXT:-5000}; \
	curl -s http://localhost:$$APP_PORT_EXT/health || echo "$(RED)API not responding$(RESET)"

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
