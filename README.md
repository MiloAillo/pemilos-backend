# Pemilos Backend

E-voting system backend for SMKN 8 Semarang school elections.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
   - [System Architecture](#system-architecture)
   - [Docker Multi-Layer Composition](#docker-multi-layer-composition-pattern)
   - [Service Topology](#service-topology)
   - [Application Flow](#application-flow-complete-voting-cycle)
3. [Tech Stack](#tech-stack)
   - [Core Framework](#core-framework)
   - [Database & Caching](#database--caching)
   - [Real-time & External Services](#real-time--external-services)
   - [Security](#security)
   - [Logging & Monitoring](#logging--monitoring)
   - [Development Tools](#development-tools)
4. [Project Structure](#project-structure)
   - [Directory Overview](#directory-overview)
   - [Key Directories Explained](#key-directories-explained)
5. [Prerequisites](#prerequisites)
6. [Getting Started](#getting-started)
   - [Environment Setup](#environment-setup)
   - [First Run](#first-run)
7. [Development](#development)
   - [Starting Development Environment](#starting-development-environment)
   - [Running Without Docker](#running-without-docker)
8. [Production Deployment](#production-deployment)
   - [Pre-Production Checklist](#pre-production-checklist)
   - [Deploying to Production](#deploying-to-production)
   - [Production Considerations](#production-considerations)
9. [Monitoring & Observability](#monitoring--observability)
   - [Prometheus Metrics](#prometheus-metrics)
   - [Grafana Dashboards](#grafana-dashboards)
   - [Loki Log Aggregation](#loki-log-aggregation)
   - [Service Health Checks](#service-health-checks)
10. [API Documentation](#api-documentation)
    - [Authentication](#authentication)
    - [Voters (Admin)](#voters-admin)
    - [Candidates](#candidates)
    - [Voting](#voting)
    - [Settings (Admin)](#settings-admin)
    - [Users (Admin)](#users-admin)
11. [Documentation & References](#documentation--references)
12. [Security Considerations](#security-considerations)
    - [Security Features Implemented](#security-features-implemented)
    - [Critical Security Notes](#critical-security-notes)
    - [Breaking Changes](#breaking-changes)
13. [Troubleshooting](#troubleshooting)
    - [Common Issues](#common-issues)
    - [Health Check Commands](#health-check-commands)
14. [Makefile Commands Reference](#makefile-commands-reference)
    - [Development Commands](#development-commands)
    - [Production Commands](#production-commands)
    - [General Commands](#general-commands)
    - [Flag Examples](#flag-examples)
15. [Changelog](#changelog)

---

## 1. Overview

Pemilos Backend is an electronic voting system designed specifically for school student council elections. The system provides secure, transparent, and real-time voting capabilities for OSIS (Organisasi Siswa Intra Sekolah) and MPK (Majelis Permusyawaratan Kelas) categories, enabling schools to conduct digital elections.

The backend implements multiple security layers to ensure election integrity. JWT-based authentication validates voter identity through NIS (Nomor Induk Siswa) credentials for students, while Redis-based rate limiting prevents brute force attacks. The core anti-double-voting mechanism uses Redlock, a distributed lock implementation that prevents race conditions at the database level, combined with MongoDB constraints and application-level checks for defense in depth.

Real-time results are delivered via Pusher WebSocket, allowing voters and administrators to see live vote counts as ballots are cast. Comprehensive monitoring with Prometheus metrics collection, Grafana dashboards, and Loki log aggregation ensures system observability in production environments. The application is containerized with Docker and orchestrated using a three-layer Docker Compose pattern that separates development and production configurations while maintaining DRY principles.

Target users include everyone who participate in elections, and administrators who manage voter registration, candidate information, and election settings. The system is built with Node.js 20+ and TypeScript, leveraging Express.js for the REST API, Mongoose for MongoDB object-document mapping, and IORedis for Redis client operations.

---

## 2. Architecture

### 2.1 System Architecture

```mermaid
flowchart TB
    subgraph Client["Client Layer"]
        Browser[Browser]
    end

    subgraph Backend["API Layer"]
        API[Express API<br/>:5000]
        Auth[JWT Auth]
        RateLimit[Rate Limiter]
    end

    subgraph Data["Data Layer"]
        MongoDB[(MongoDB<br/>:27017)]
        Redis[(Redis<br/>:6379)]
        Pusher[Pusher<br/>WebSocket]
    end

    subgraph Monitoring["Monitoring Stack"]
        Prometheus[Prometheus<br/>:9090]
        Grafana[Grafana<br/>:3000]
        Loki[Loki<br/>:3100]
        Promtail[Promtail]
        NodeExp[Node Exporter<br/>:9100]
        MongoExp[MongoDB Exporter<br/>:9216]
    end

    Client -->|HTTPS| API
    API -->|Query/Update| MongoDB
    API -->|Rate Limit| Redis
    API -->|Real-time Events| Pusher
    API -->|Metrics| Prometheus
    NodeExp -->|System Metrics| Prometheus
    MongoExp -->|DB Metrics| Prometheus
    API -->|Application Logs| Promtail
    Promtail -->|Log Shipping| Loki
    Prometheus -->|Data Source| Grafana
    Loki -->|Data Source| Grafana
```

### 2.2 Docker Multi-Layer Composition Pattern

The project uses a three-layer Docker Compose architecture that follows the DRY (Don't Repeat Yourself) principle:

**Base Layer** (`docker-compose.yml`): Contains shared service definitions including images, ports, networks, and volume configurations. This file defines the complete service stack and should not contain secrets.

**Development Override** (`docker-compose.dev.yml`): Adds development-specific configurations including hot-reload volume mounts, exposed debug ports, and development environment variables. Applied during local development.

**Production Override** (`docker-compose.prod.yml`): Applies production hardening including resource limits, restart policies, production environment variables, and named volumes for persistent data (logs, uploads).

**Why this pattern:**

- **DRY Principle**: Shared configuration lives in base, environment-specific in overrides
- **Security**: No secrets in base layer, injected at runtime via environment files
- **Maintainability**: Change image version once in base, applies to all environments

**Command pattern:**
```bash
# Development
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up

# Production
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 2.3 Service Topology

| Service | Image | Internal Port | External Port | Purpose |
|---------|-------|---------------|---------------|---------|
| API | - | 5000 | 5000/8000 | REST API |
| MongoDB | bitnami/mongodb | 27017 | 27017 | Voter/Candidate/Vote data |
| Redis | redis:7-alpine | 6379 | 6379 | Rate limiting + Redlock |
| Prometheus | prom/prometheus | 9090 | 9090 | Metrics collection |
| Grafana | grafana/grafana-oss | 3000 | 3000 | Visualization dashboards |
| Loki | grafana/loki:3.4.1 | 3100 | 3100 | Log aggregation |
| Promtail | grafana/promtail:3.4.1 | - | - | Log shipper |
| Node Exporter | prom/node-exporter | 9100 | 9100 | System metrics |
| MongoDB Exporter | percona/mongodb_exporter:0.40.0 | 9216 | 9216 | MongoDB metrics |

**Network**: All services communicate on `pemilos_network` (bridge driver)

### 2.4 Application Flow (Complete Voting Cycle)

```mermaid
sequenceDiagram
    participant Admin
    participant Voter
    participant API
    participant Redis
    participant MongoDB
    participant Pusher

    Note over Admin,Voter: ADMIN SETUP PHASE

    Admin->>API: POST /api/v1/auth/login
    API->>Redis: Validate credentials
    API->>MongoDB: Fetch user
    API-->>Admin: JWT issued (long-lived)

    Admin->>API: POST /api/v1/admin/voter (CSV upload)
    API->>MongoDB: Batch insert voters

    Admin->>API: POST /api/v1/admin/candidate
    API->>MongoDB: Create candidates (OSIS/MPK)

    Admin->>API: POST /api/v1/admin/setting
    API->>Redis: Set "isVotingAllowed" = true

    Note over Admin,Voter: VOTER FLOW

    Voter->>API: POST /api/v1/auth/login (NIS + password)
    API->>MongoDB: Validate credentials
    API-->>Voter: JWT issued (5min expiry)

    Voter->>API: GET /api/v1/candidate
    API->>MongoDB: Fetch candidates by label
    API-->>Voter: Candidate list (OSIS/MPK)

    Voter->>API: POST /api/v1/vote (candidate IDs)
    API->>API: authMiddleware validates JWT
    API->>API: validateDTO checks ObjectID format

    API->>Redis: Redlock.acquire (30s timeout)
    Redis-->>API: Lock acquired

    API->>Redis: Check "isVotingAllowed" flag
    API->>MongoDB: Check User.isVoted flag
    API->>MongoDB: Query Vote collection (duplicate check)

    API->>MongoDB: Insert Vote (OSIS)
    API->>MongoDB: Insert Vote (MPK)
    API->>MongoDB: Update User.isVoted = true

    API->>Pusher: Trigger debounced event (live results)
    API->>Redis: Redlock.release
    API-->>Voter: Success (vote confirmation)

    Voter->>Pusher: Subscribe (real-time updates)
    Pusher-->>Voter: Live vote counts
```

**Security Layers:**

- **Rate Limiting**: Redis sliding window prevents brute force attacks
- **JWT Validation**: Ensures only authenticated users can vote
- **Redlock**: Distributed lock prevents race condition double-voting
- **Database Constraints**: MongoDB unique indexes on Vote collection
- **Application-Level**: User.isVoted flag as first-pass duplicate check

---

## 3. Tech Stack

### 3.1 Core Framework

- **Node.js 20+** - JavaScript runtime
- **TypeScript** - Static typing for defensive programming
- **Express 5.x** - Web framework

### 3.2 Database & Caching

- **MongoDB** - Primary data store (voter/candidate/vote data)
- **Mongoose** - ODM for MongoDB
- **Redis 7** - Rate limiting and caching
- **Redlock 5.0.0-beta.2** - Distributed locking for anti-double-voting

### 3.3 Real-time & External Services

- **Pusher** - WebSocket for real-time vote updates
- **csv-parser** - Voter CSV import parsing

### 3.4 Security

- **JWT** - Authentication tokens
- **Helmet** - HTTP security headers
- **CORS** - Cross-origin resource sharing

### 3.5 Logging & Monitoring

- **Winston 3.17.0** - Application logging (logs stored in `/src/logs`)
- **Prometheus** - Metrics collection
- **Grafana** - Visualization dashboards
- **Loki 3.4.1** - Log aggregation
- **Promtail 3.4.1** - Log shipping

### 3.6 Database Monitoring

- **Percona MongoDB Exporter 0.40.0** - MongoDB metrics
- **Prometheus Node Exporter** - System metrics

### 3.7 Development Tools

- **nodemon 3.1.10** - Hot reload during development
- **ts-node 10.9.2** - TypeScript execution
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration

---

## 4. Project Structure

```
pemilos-backend/
├── backend/
│   ├── src/
│   │   ├── configs/          # Service clients (db, redis, pusher, redlock)
│   │   ├── controllers/      # HTTP handlers (auth, voter, candidate, user, setting)
│   │   ├── dtos/             # Joi validation schemas (auth, vote, user, candidate)
│   │   ├── exceptions/       # Error handling (custom errors, global handler)
│   │   ├── middlewares/      # Express middleware (auth, rate-limit, validate, admin, async-handler)
│   │   ├── models/           # Mongoose schemas (User, Vote, Candidate)
│   │   ├── routes/           # Route definitions (v1, auth, vote, candidate, admin, health)
│   │   ├── services/         # Business logic (auth, voter, candidate, user, setting)
│   │   ├── utils/            # Utilities (jwt, logger, rbac, audit, transaction, server, variables)
│   │   └── index.ts          # Application entry point
│   ├── Dockerfile.dev        # Development multi-stage build
│   ├── Dockerfile.prod       # Production optimized build
│   ├── package.json          # Dependencies and scripts
│   └── tsconfig.json         # TypeScript compiler config
├── config/
│   ├── grafana/              # Grafana provisioning (datasources, dashboards)
│   ├── prometheus/           # Prometheus scrape config
│   ├── loki/                 # Loki configuration
│   ├── promtail/             # Promtail log shipping config
│   ├── mongo/                # MongoDB init scripts
│   └── nginx/                # Nginx reverse proxy configs (optional)
├── docker-compose.yml        # Base service definitions
├── docker-compose.dev.yml    # Development overrides
├── docker-compose.prod.yml   # Production overrides
├── Makefile                  # Automation commands (dev-up, prod-up, backup, logs, etc.)
├── .env.example              # Environment template
├── .env.dev                  # Development environment
├── .env.prod                 # Production environment
└── README.md                 # This file
```

### 4.1 Key Directories Explained

| Directory | Purpose |
|-----------|---------|
| `configs/` | Service client initialization using singleton patterns for Redis, MongoDB, Pusher, and Redlock |
| `controllers/` | Thin layer that parses requests, calls services, and formats responses |
| `services/` | Thick layer containing business logic, database transactions, and Redlock locking |
| `middlewares/` | Cross-cutting concerns: authentication, rate limiting, validation, error handling |
| `models/` | Mongoose schemas with inline documentation on indexes and relationships |
| `dtos/` | Joi schemas for request/response validation with type-safe TypeScript inference |
| `utils/` | Pure functions for shared utilities (JWT, logger, RBAC, transaction helpers) |

---

## 5. Prerequisites

Before running Pemilos Backend, ensure you have the following installed:

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **Docker** | 20.10+ | Container runtime |
| **Docker Compose** | 2.0+ | Multi-container orchestration |
| **Node.js** | 20+ | Local development (optional) |
| **Make** | 3.81+ | Build automation |

**Optional for local development without Docker:**
- MongoDB 6.0+
- Redis 7+

---

## 6. Getting Started

### 6.1 Environment Setup

1. **Clone the repository:**
```bash
git clone https://github.com/algazza/pemilos-backend.git
cd pemilos-backend
```

2. **Copy environment template:**
```bash
cp .env.example .env.dev
```

3. **Configure environment variables** in `.env.dev`:

```bash
# Server Configuration
APP_PORT=8000
APP_PORT_EXTERNAL=5000
NODE_ENV=development

# JWT Secret (REQUIRED - min 32 characters)
# Generate with: openssl rand -base64 32
JWT_KEY=your-jwt-key-min-32-characters-long

# CORS: Comma-separated list of allowed origins
ALLOWED_ORIGINS=http://localhost:5174

# Rate Limiting
WINDOW_SIZE_IN_SECONDS=60
MAX_REQUESTS=100

# Redis Configuration
REDIS_USERNAME=
REDIS_PASSWORD=
REDIS_PORT=6379
REDIS_HOST=redis

# MongoDB Configuration
MONGODB_ROOT_USER=admin
MONGODB_ROOT_PASSWORD=your-mongodb-password
MONGODB_HOST=mongo_db
MONGODB_PORT=27017
MONGODB_DATABASE=pemilom

# Pusher Configuration (get from https://pusher.com)
PUSHER_APPID=your-pusher-app-id
PUSHER_KEY=your-pusher-key
PUSHER_SECRET=your-pusher-secret
PUSHER_CLUSTER=ap1
```

### 6.2 First Run

Start the development environment:

```bash
make dev-up
```

This command starts all services:
- API at http://localhost:5000
- MongoDB at localhost:27017
- Redis at localhost:6379
- Grafana at http://localhost:3000
- Loki at http://localhost:3100
- Prometheus at http://localhost:9090

---

## 7. Development

### 7.1 Starting Development Environment

```bash
# Start all services with rebuild
make dev-up BUILD=1

# Start without rebuild (faster)
make dev-up

# View logs
make dev-logs

# Stop and remove containers
make dev-down

# Rebuild everything from scratch
make dev-rebuild
```

**Useful flags:**
```bash
make dev-up BUILD=1    # Build images before starting
make dev-logs TAIL=100 # Show last 100 lines
make dev-logs TIMESTAMPS=1  # Show timestamps
```

### 7.2 Running Without Docker

For local development without Docker:

```bash
# Install dependencies
cd backend
npm install

# Run TypeScript compiler
npm run build

# Start the server
npm start
# OR for development with hot-reload
npm run dev
```

**Note:** When running without Docker, ensure MongoDB and Redis are running locally and accessible.

---

## 8. Production Deployment

### 8.1 Pre-Production Checklist

Before deploying to production, ensure:

1. **Environment variables configured:**
   - [ ] `JWT_KEY` is at least 32 characters
   - [ ] `NODE_ENV=production`
   - [ ] `ALLOWED_ORIGINS` set to production domain(s)
   - [ ] Strong passwords for MongoDB and Redis
   - [ ] Pusher credentials configured

2. **Security considerations:**
   - [ ] SSL/TLS certificates obtained
   - [ ] Firewall rules configured
   - [ ] Backup strategy in place
   - [ ] Monitoring alerts configured

3. **Generate production JWT key:**
```bash
openssl rand -base64 32
```

### 8.2 Deploying to Production

1. **Create production environment file:**
```bash
cp .env.example .env.prod
# Edit .env.prod with production values
```

2. **Start production environment:**
```bash
make prod-up BUILD=1
```

3. **Verify health:**
```bash
make prod-health
```

### 8.3 Production Considerations

| Aspect | Recommendation |
|--------|----------------|
| **Reverse Proxy** | Use nginx with SSL termination |
| **Monitoring** | Grafana dashboards pre-configured in `config/grafana/` |
| **Logging** | Logs persisted to named volumes (`prod_logs`) |
| **Backups** | Use `make prod-backup` for MongoDB backups |
| **Updates** | Pull latest images with `make prod-pull` then restart |

---

## 9. Monitoring & Observability

### 9.1 Prometheus Metrics

Prometheus runs on port 9090 and collects:
- Application metrics (request rate, response time)
- Node Exporter (CPU, memory, disk, network)
- MongoDB Exporter (database metrics)

**Scrape Configuration:**
| Job | Target | Interval | Purpose |
|-----|--------|----------|---------|
| prometheus | localhost:9090 | 30s | Self-monitoring |
| node | node-exporter:9100 | 30s | System metrics |
| mongodb | mongo-exporter:9216 | 30s | Database metrics |
| app | app:8000/metrics | **10s** | Application metrics |

**Data Retention:** 7 days

**Access:** http://localhost:9090

**Example PromQL Queries:**

```promql
# Request rate (requests per second)
rate(http_requests_total[5m])

# Vote rate (votes per minute)
rate(votes_submitted_total[1m]) * 60

# Error rate (percentage)
rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m]) * 100

# P95 latency (seconds)
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

### 9.2 Grafana Dashboards

Grafana runs on port 3000 with pre-configured dashboards:
- **Pemilom Dashboard**: Application metrics visualization
- **Node Exporter**: System resource usage
- **MongoDB Exporter**: Database performance

**Default credentials:** admin/admin (change on first login)

**Access:** http://localhost:3000

### 9.3 Loki Log Aggregation

Loki runs on port 3100 and aggregates logs from:
- Application logs (Winston)
- Container logs (Promtail)

**Access:** http://localhost:3100

**Example LogQL Queries:**

```logql
# Get all application logs with ERROR level
{job="pemilom"} |= "ERROR"

# Filter by specific error message
{job="pemilom"} |= "vote failed"

# Get logs from the last hour
{job="pemilom"} | json | level="error"
```

### 9.4 Winston Application Logs

Application logs are stored in `/src/logs` with the following configuration:

| Setting | Value |
|---------|-------|
| **Rotation Pattern** | Hourly (YYYY-MM-DD-HH) |
| **Max File Size** | 20MB per file |
| **Retention** | 7 days |
| **Compression** | .gz (after rotation) |

**File Naming Convention:**
```
app-2026-09-18-08.log      # Current hour (uncompressed)
app-2026-09-18-07.log.gz   # Previous hours (compressed)
app-2026-09-18-06.log.gz
...
```

**Log Levels:** error, warn, info, debug

### 9.5 Service Health Checks

```bash
# Check all services
make prod-ps

# Check API health
curl http://localhost:5000/health

# View container resource usage
make prod-stats

# View running processes
make prod-top
```

---

## 10. API Documentation

### 10.1 Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/auth/login` | Login with credentials | No |
| GET | `/api/v1/auth/me` | Get current user | Yes |

**Login Request:**
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-password"}'
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "...",
      "username": "admin",
      "role": "admin"
    }
  }
}
```

### 10.2 Voters (Admin)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/admin/upload/csv` | Bulk upload voters from CSV | Admin |
| POST | `/api/v1/admin/upload/csv/token` | Export tokenized voters | Admin |
| GET | `/api/v1/admin/count` | Get voter count | Admin |

**CSV Format:**
```csv
nis,name,class,password
1234567890,John Doe,XIPA1,password123
```

### 10.3 Candidates

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/v1/candidate` | List all candidates | Yes |
| POST | `/api/v1/admin/candidate` | Create candidate | Admin |
| DELETE | `/api/v1/admin/candidate/:id` | Delete candidate | Admin |

### 10.4 Voting

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/vote` | Cast vote | Yes |
| GET | `/api/v1/admin/vote/status` | Check voting status | No |
| PUT | `/api/v1/admin/vote/status` | Toggle voting on/off | Admin |
| PUT | `/api/v1/admin/reset` | Reset all votes | Admin |

**Cast Vote Request:**
```bash
curl -X POST http://localhost:5000/api/v1/vote \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"osis": "60d5ec49f1b2c72b8c8e4f1a", "mpk": "60d5ec49f1b2c72b8c8e4f1b"}'
```

**Note:** Candidate IDs must be valid MongoDB ObjectIDs (24-character hex strings).

### 10.5 Settings (Admin)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/v1/admin/live/count` | Get live vote count | Admin |

### 10.6 Users (Admin)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/admin/user` | Create user | Admin |
| GET | `/api/v1/admin/user` | List users | Admin |
| GET | `/api/v1/admin/user/:id` | Get user by ID | Admin |
| DELETE | `/api/v1/admin/user/:id` | Delete user | Admin |

### 10.7 Metrics Endpoint

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/metrics` | Prometheus metrics | **No** |

**Example Request:**
```bash
curl http://localhost:5000/metrics
```

**Response (Prometheus format):**
```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="POST",status_code="200",endpoint="/api/v1/vote"} 142

# HELP http_request_duration_seconds HTTP request duration
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.1"} 89
http_request_duration_seconds_bucket{le="0.5"} 134

# HELP votes_submitted_total Total votes submitted
# TYPE votes_submitted_total counter
votes_submitted_total 71
```

---

## 11. Documentation & References

| Document | Location | Description |
|----------|----------|-------------|
| **Postman Collection** | `docs/API/Pemilos-Backend.postman_collection.json` | Complete API collection with examples |
| **Environment (Dev)** | `docs/API/Pemilos-Backend.postman_environment.dev.json` | Postman dev environment |
| **Environment (Prod)** | `docs/API/Pemilos-Backend.postman_environment.prod.json` | Postman prod environment |
| **Sample Voters** | `docs/voters.csv` | Sample voter data |
| **Sample Voters (with tokens)** | `docs/dummy_voters_with_tokens.csv` | Pre-generated voter tokens |
| **Nginx Setup** | `config/nginx/HOWTO.md` | Reverse proxy configuration |
| **MongoDB Init** | `config/mongo/init.js.example` | Database initialization script |

**Postman Import:**
1. Open Postman
2. Go to File > Import
3. Select `docs/API/Pemilos-Backend.postman_collection.json`
4. Select appropriate environment file

### 11.6 Available Application Metrics

The application exposes the following Prometheus metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Total HTTP requests by method, status, endpoint |
| `http_request_duration_seconds` | Histogram | HTTP request duration in seconds |
| `votes_submitted_total` | Counter | Total votes submitted |
| `authenticated_users_active` | Gauge | Number of currently authenticated users |
| `mongo_operations_total` | Counter | MongoDB operations by type (insert, update, query, delete) |
| `redis_operations_total` | Counter | Redis operations by type (get, set, del) |

**Example PromQL Queries:**

```promql
# Request rate by endpoint
rate(http_requests_total[5m])

# Error rate by status code
rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m]) * 100

# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Votes per minute
rate(votes_submitted_total[1m]) * 60

# Active MongoDB query operations
mongo_operations_total{operation="query"}

# Redis hit rate
rate(redis_operations_total{operation="get"}[5m])
```

---

## 12. Security Considerations

### 12.1 Security Features Implemented

The system implements multiple layers of security:

| Layer | Implementation |
|-------|----------------|
| **Authentication** | JWT with HS256 signature verification |
| **Authorization** | Role-based access control (admin/voter) |
| **Rate Limiting** | Redis-based sliding window (100 req/min) |
| **Distributed Lock** | Redlock (30s timeout) prevents double-voting |
| **Input Validation** | Joi DTO schemas with sanitization |
| **Security Headers** | Helmet with CSP, HSTS, XSS protection |
| **CORS** | Whitelist-based origin validation |
| **Database Constraints** | Unique indexes prevent duplicate votes |

### 12.2 Critical Security Notes

- **Password Storage**: All passwords are stored without hashing

### 12.9 Redis ACL Security

The system uses Redis ACL (Access Control List) to restrict commands available to the application.

**redis.conf Configuration:**

```redis
# Define admin user with full access
user admin on >adminpassword ~* +@all

# Define app user with restricted access
user appuser on >apppassword ~* +@read +@write +@list +@set +@sortedset +@hash +@string +@bitmap +@hyperloglog +@stream -@dangerous

# Denied commands for appuser
acl deny command FLUSHALL, FLUSHDB, CONFIG, SCRIPT, SHUTDOWN, DEBUG, BGSAVE, BGREWRITEAOF, SAVE, LASTSAVE, MONITOR, SLAVEOF, REPLICAOF, SHOW, MEMORY, FAILOVER
```

**User Roles:**

| User | Permissions | Denied Commands |
|------|-------------|-----------------|
| `admin` | Full access (+@all) | None |
| `appuser` | Read/Write only | FLUSHALL, FLUSHDB, CONFIG, SCRIPT, SHUTDOWN, DEBUG, BGSAVE, BGREWRITEAOF, SAVE, LASTSAVE, MONITOR, SLAVEOF, REPLICAOF, SHOW, MEMORY, FAILOVER |

**Setup Instructions:**

1. Enable ACL in redis.conf:
```redis
aclfile /usr/local/etc/redis-users.acl
```

2. Create the ACL file with the user definitions above

3. Restart Redis to load the ACL rules

4. Configure environment variables:
```bash
REDIS_USERNAME=appuser
REDIS_PASSWORD=apppassword
```

**Testing Commands:**

```bash
# Test connection with appuser
redis-cli -u redis://appuser:apppassword@localhost:6379 PING

# Verify denied commands
redis-cli -u redis://appuser:apppassword@localhost:6379 FLUSHALL
# Should return: (error) NOPERM this user has no permissions to run the 'flushall' command

# Verify allowed operations work
redis-cli -u redis://appuser:apppassword@localhost:6379 SET testkey testvalue
# Should return: OK
```

---

## 13. Troubleshooting

### 13.1 Common Issues

| Issue | Solution |
|-------|----------|
| **Server won't start** | Check that JWT_KEY is at least 32 characters |
| **MongoDB connection failed** | Ensure container is healthy: `docker ps` |
| **Rate limiting triggered** | Wait 60 seconds or adjust MAX_REQUESTS |
| **CORS errors** | Add your origin to ALLOWED_ORIGINS |
| **Double voting occurred** | Check MongoDB for duplicate vote records |

### 13.2 Health Check Commands

```bash
# Check all container status
make dev-ps

# Check API response
curl http://localhost:5000/health

# View recent logs
make dev-logs TAIL=50

# Check resource usage
make dev-stats
```

**Debug inside container:**
```bash
make dev-exec SERVICE=app CMD=sh
```

---

## 14. Makefile Commands Reference

### 14.1 Development Commands

| Command | Description |
|---------|-------------|
| `make dev-up` | Start development environment |
| `make dev-down` | Stop and remove containers |
| `make dev-stop` | Stop containers (preserve state) |
| `make dev-start` | Start stopped containers |
| `make dev-restart` | Restart services |
| `make dev-pause` | Pause containers |
| `make dev-unpause` | Resume containers |
| `make dev-build` | Build images |
| `make dev-rebuild` | Rebuild from scratch |
| `make dev-pull` | Pull latest images |
| `make dev-logs` | Show logs |
| `make dev-ps` | Show containers |
| `make dev-stats` | Show resource usage |
| `make dev-top` | Show running processes |
| `make dev-exec` | Execute command in container |

### 14.2 Production Commands

| Command | Description |
|---------|-------------|
| `make prod-up` | Start production environment |
| `make prod-down` | Stop and remove containers |
| `make prod-stop` | Stop containers |
| `make prod-start` | Start stopped containers |
| `make prod-restart` | Restart services |
| `make prod-build` | Build production images |
| `make prod-rebuild` | Rebuild production environment |
| `make prod-pull` | Pull latest images |
| `make prod-logs` | Show production logs |
| `make prod-ps` | Show production containers |
| `make prod-stats` | Show resource usage |
| `make prod-backup` | Backup MongoDB |
| `make prod-health` | Check service health |

### 14.3 General Commands

| Command | Description |
|---------|-------------|
| `make prune` | Remove dangling Docker images |
| `make clean` | Remove all dangling images |
| `make help` | Show all available commands |

### 14.4 Flag Examples

```bash
make dev-up BUILD=1              # Build before starting
make dev-up WAIT=1               # Wait for healthy services
make dev-logs TAIL=100           # Show last 100 lines
make dev-logs SINCE=10m          # Show logs from last 10 minutes
make dev-logs TIMESTAMPS=1       # Show timestamps
make dev-build CACHE=0           # Build without cache
make dev-down VOLUMES=1          # Remove volumes too
make dev-ps ALL=1                # Show all containers
make dev-ps STATUS=running       # Filter by status
make dev-exec SERVICE=app CMD=sh # Shell into app
```

---

## 15. Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

#### Added

- **Monitoring & Observability**
  - Prometheus metrics middleware with 6 custom metrics (HTTP requests, duration, vote operations, voter lookups, auth attempts, errors)
  - Grafana application dashboard with 10 monitoring panels optimized for election day
  - Winston daily log rotation (hourly, 20MB max, 7-day retention, gzip compression)
  - Promtail integration for shipping logs to Loki with `job="pemilom"` label
  - `/metrics` endpoint for Prometheus scraping
  - Health check endpoints: `/health` (root) and `/api/v1/health`

- **Security Enhancements**
  - Redis ACL configuration with role-based access (`appuser` with restricted commands, `admin` with full access)
  - `REDIS_USERNAME` and `REDIS_PASSWORD` environment variables for authenticated connections
  - Default Redis user disabled for security
  - Runtime validation for required credentials (Pusher, Redis username)

- **Documentation**
  - Comprehensive monitoring section in README (Prometheus, Grafana, Loki)
  - Redis ACL setup and testing instructions
  - Postman collection updated with `/metrics` endpoint in "Monitoring" folder
  - Service health check documentation

#### Changed

- **Infrastructure Configuration**
  - Prometheus retention reduced to 7 days (optimized for small production environment)
  - Prometheus scrape interval set to 10 seconds for real-time election monitoring
  - Grafana dashboard refresh rate set to 5 seconds for active monitoring
  - Docker Compose: Added Grafana dashboard provisioning with `app-dashboard.json` as default

- **Logging Improvements**
  - Replaced basic Winston file transport with `winston-daily-rotate-file`
  - Log files now rotate hourly with automatic compression and cleanup
  - Structured logging format for better Loki parsing
  - Removed console.log statements from production code (voter.service.ts, voter.controller.ts)

- **Dependencies**
  - Added `prom-client@15.1.3` for Prometheus metrics
  - Added `winston-daily-rotate-file@5.0.0` for log rotation

#### Removed

- Nginx reverse proxy configuration (using Cloudflare for SSL/proxy instead)
  - Deleted `config/nginx/nginx.conf`
  - Deleted `config/nginx/app.conf`
  - Deleted `config/nginx/grafana.conf`
  - Deleted `config/nginx/HOWTO.md`

#### Fixed

---

### Previous Changes

#### Added (Historical)

- Postman collection and environment files for API testing
- Sample voter CSV files
- MongoDB exporter integration for database metrics
- Node Exporter for system-level metrics
- Grafana dashboards for visualization
- Loki and Promtail for log aggregation
- Redlock distributed locking for anti-double-voting mechanism

#### Changed (Historical)

- API field name consistency: `class` instead of `kelas` across all user endpoints
- JWT signature verification: Replaced `jwt.decode()` with `jwt.verify()` for proper cryptographic validation
- Rate limiting: Implemented Redis Lua script for atomic operations
- File upload security: Added MIME type and extension validation with path traversal protection
- CORS configuration: Changed from permissive to whitelist-based origin validation

#### Fixed (Historical)

- JWT signature verification bypass vulnerability
- Race condition in voting logic with Redlock
- NoSQL injection via regex sanitization
- Unrestricted file upload vulnerabilities
- Path traversal in file upload handling
- Admin routes unprotected by authentication
- Weak password generation using Math.random()
- Missing security headers (Helmet)
- CSV injection prevention
- IP spoofing in rate limiting (Cloudflare CF-Connecting-IP trust)
- Input validation field name mismatch (class/kelas)