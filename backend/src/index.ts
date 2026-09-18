import express from "express";
import { errorHandler } from "./exceptions/error_handler.exception";
import { rateLimitMiddleware } from "./middlewares/rate-limit.middleware";
import { connectToMongoose } from "./configs/db.config";
import v1Route from "./routes/v1.route";
import healthRoute from "./routes/health.route";
import { logger } from "./utils/logger.util";
import dotenv from "dotenv";
import path from "path";
import { createServer, Server } from "http";
import { bootstrap, shutdown } from "./utils/server.util";
import helmet from "helmet";
import cors from "cors";
const cookieParser = require('cookie-parser')

// =============================================================================
// ENVIRONMENT CONFIGURATION
// =============================================================================
// Load .env file for local non-Docker development only.
// Docker environments inject vars via env_file in docker-compose.
// This serves as a fallback when critical vars are missing (indicating local run).
if (!process.env.NODE_ENV || !process.env.APP_PORT) {
  const NODE_ENV = process.env.NODE_ENV || 'development';
  const envFile = NODE_ENV === 'production' ? '.env.prod' : '.env.dev';
  const envPath = path.resolve(__dirname, "../../", envFile);
  dotenv.config({ path: envPath });
  
  // After loading, re-check NODE_ENV
  if (!process.env.NODE_ENV) {
    console.error('FATAL: NODE_ENV environment variable must be set before starting the application');
    process.exit(1);
  }
}

// =============================================================================
// ENVIRONMENT VALIDATION
// =============================================================================
// ⚠️ SECURITY: Fail fast if critical environment variables are missing.
// This prevents the application from starting with insecure defaults or
// attempting to connect to undefined services, which could cause runtime
// errors in production or expose sensitive endpoints without proper auth.
const requiredEnvVars = [
  'APP_PORT',
  'MONGODB_ROOT_USER',
  'MONGODB_ROOT_PASSWORD',
  'MONGODB_DATABASE',
  'MONGODB_HOST',
  'MONGODB_PORT',
  'REDIS_HOST',
  'REDIS_PORT',
  'JWT_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// ⚠️ SECURITY: Enforce minimum JWT key length to prevent brute-force attacks.
// Keys shorter than 32 characters are vulnerable to dictionary and timing attacks.
// HS256 requires at least 256 bits (32 bytes) for cryptographic security.
if (process.env.JWT_KEY && process.env.JWT_KEY.length < 32) {
  logger.error('JWT_KEY must be at least 32 characters long');
  process.exit(1);
}

// =============================================================================
// APPLICATION INITIALIZATION
// =============================================================================
const app = express();
const port = String(process.env.APP_PORT || "3000");

// =============================================================================
// CORS CONFIGURATION
// =============================================================================
// ⚠️ SECURITY: Whitelist approach prevents CSRF and unauthorized cross-origin requests.
// Parse ALLOWED_ORIGINS from comma-separated string to support multiple frontend domains.
// This is critical for production where origins must be explicitly trusted.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5174')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  // Dynamic origin validation - rejects requests from untrusted domains
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  // Enable cookies and authorization headers in cross-origin requests
  // Required for JWT tokens stored in httpOnly cookies
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  // Cache preflight requests for 10 minutes to reduce OPTIONS request overhead
  maxAge: 600
};

// =============================================================================
// SECURITY MIDDLEWARE
// =============================================================================
// ⚠️ SECURITY: Helmet sets secure HTTP headers to protect against common attacks.
// Applied FIRST to ensure all responses include security headers.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      // Only allow resources from same origin to prevent XSS via external scripts
      defaultSrc: ["'self'"],
      // Allow inline styles for CSS-in-JS libraries (consider removing in production)
      styleSrc: ["'self'", "'unsafe-inline'"],
      // Block inline scripts - all JS must come from same origin
      scriptSrc: ["'self'"],
      // Allow images from same origin, data URIs, and HTTPS sources
      imgSrc: ["'self'", "data:", "https:"],
    }
  },
  // HTTP Strict Transport Security - force HTTPS for 1 year including subdomains
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  // Prevent MIME type sniffing attacks
  noSniff: true,
  // Enable XSS filter in older browsers
  xssFilter: true,
  // Hide Express framework signature to reduce attack surface reconnaissance
  hidePoweredBy: true
}));

// =============================================================================
// MIDDLEWARE STACK
// =============================================================================
// ⚠️ ORDER MATTERS: Middleware executes top-to-bottom for requests.
// CORS must come after Helmet but before authentication to allow preflight requests.
app.use(cors(corsOptions));

// Parse cookies before authentication middleware that reads JWT from cookies
app.use(cookieParser());

// Parse JSON bodies - limit size to prevent DoS via large payloads (default 100kb)
app.use(express.json());

// Global rate limiting applied to ALL routes as defense-in-depth.
// Route-specific limits in v1.route.ts provide additional granular control.
app.use(rateLimitMiddleware);

// =============================================================================
// ROUTE REGISTRATION
// =============================================================================
// Health check endpoint (root level, not versioned)
// Used by Docker health checks, Kubernetes probes, and load balancers
app.use("/health", healthRoute);

// Mount all v1 API routes under /api/v1/ namespace for versioning.
// This allows v2 routes to coexist without breaking existing clients.
app.use("/api/v1/", v1Route);

// =============================================================================
// ERROR HANDLING
// =============================================================================
// ⚠️ MUST BE LAST: Express error handlers require 4 parameters and must be
// registered after all routes. This catches errors from async route handlers
// and prevents stack traces from leaking to clients in production.
app.use(errorHandler);

// =============================================================================
// SERVER STARTUP
// =============================================================================
// Bootstrap handles database connection, graceful shutdown hooks, and HTTP server creation.
// See server.util.ts for lifecycle management implementation.
bootstrap(app, port);