import mongoose from "mongoose"
import { logger } from "../utils/logger.util"

/**
 * Establishes connection to MongoDB using Mongoose ODM.
 * 
 * Connection Strategy:
 * - Mongoose maintains a singleton connection pool internally
 * - First mongoose.connect() call initializes connection
 * - Subsequent calls reuse existing connection (mongoose.connection.readyState check implicit)
 * 
 * Singleton Pattern:
 * - No explicit singleton variable needed (Mongoose handles this internally)
 * - mongoose.connection is globally accessible and reused across models
 * - Connection pool configuration managed by Mongoose (default: 5 connections)
 * 
 * Security: Credential Encoding
 * - MongoDB connection URIs use special characters as delimiters (@, :, /)
 * - Credentials containing these characters MUST be URL-encoded to prevent injection
 * 
 * Example Attack Vector (without encoding):
 * - Username: "admin"
 * - Password: "pass@word:123"
 * - Unencoded URI: mongodb://admin:pass@word:123@host:27017/db
 * - Parser interprets "pass" as password, "@word:123" as new host, breaking connection
 * 
 * Solution: encodeURIComponent()
 * - Encodes special chars: @ → %40, : → %3A, / → %2F
 * - Prevents URI parsing ambiguity
 * - Encoded URI: mongodb://admin:pass%40word%3A123@host:27017/db
 * 
 * authSource=admin:
 * - Specifies authentication database (where user credentials are stored)
 * - Required when connecting to non-admin databases with root credentials
 * - Without this, MongoDB tries to authenticate against target DB_NAME database
 * 
 * @returns {Promise<boolean>} true if connection successful, false on failure
 */
export const connectToMongoose = async () => {
      /**
       * Pull credentials from environment variables.
       * 
       * String() casting ensures type safety even if env vars are undefined.
       * - Prevents runtime errors from undefined values
       * - Results in "undefined" string if env var missing (will fail auth gracefully)
       */
      const DB_USERNAME = String(process.env.MONGODB_ROOT_USER)
      const DB_PASSWORD = String(process.env.MONGODB_ROOT_PASSWORD)
      const DB_NAME = String(process.env.MONGODB_DATABASE)
      const DB_HOST = String(process.env.MONGODB_HOST)
      const DB_PORT = String(process.env.MONGODB_PORT)

      /**
       * URL-encode credentials to prevent injection and parsing errors.
       * 
       * Critical Security Step:
       * - Neutralizes special characters in credentials
       * - Prevents connection string manipulation
       * - Ensures credentials are treated as opaque strings, not URI components
       * 
       * Characters encoded:
       * - @ (user/host separator) → %40
       * - : (user/pass separator, port delimiter) → %3A
       * - / (path separator) → %2F
       * - ? (query string start) → %3F
       * - # (fragment identifier) → %23
       * - And all other reserved URI characters
       */
      const encodedUsername = encodeURIComponent(DB_USERNAME)
      const encodedPassword = encodeURIComponent(DB_PASSWORD)
      const uri = `mongodb://${encodedUsername}:${encodedPassword}@${DB_HOST}:${DB_PORT}/${DB_NAME}?authSource=admin`

      try {
           /**
            * Connection Options:
            * 
            * serverSelectionTimeoutMS: 5000
            * - Maximum time (5s) to find and connect to a suitable MongoDB server
            * - Fail fast if MongoDB is unreachable (prevents long startup hangs)
            * - Default is 30s (too long for health checks and container orchestration)
            * 
            * connectTimeoutMS: 5000
            * - Maximum time (5s) for initial TCP connection to MongoDB server
            * - Separate from serverSelectionTimeoutMS (this is socket-level timeout)
            * - Prevents hanging on network issues (firewall blocks, DNS failures)
            * 
            * Why short timeouts?
            * - Faster failure detection in containerized environments
            * - Better orchestration health check compatibility (K8s, Docker Compose)
            * - Prevents cascading failures in service mesh architectures
            * 
            * Connection Pool (default, not explicitly set):
            * - maxPoolSize: 100 (max concurrent connections)
            * - minPoolSize: 0 (connections created on demand)
            * - Mongoose reuses connections across all queries and models
            */
           await mongoose.connect(uri, {
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 5000,
           })
           logger.info("Connection to database established")
           return true
      } catch (err) {
           /**
            * Error Handling:
            * - Logs error but doesn't expose connection details (no URI in log)
            * - Returns false to allow application to handle failure gracefully
            * - Common errors: authentication failed, network unreachable, wrong authSource
            */
           logger.error("Failed to establish a connection to database")
           return false
      }
}

/**
 * Gracefully closes the MongoDB connection.
 * 
 * Shutdown Strategy:
 * - Waits for all in-flight operations to complete before closing
 * - Closes all connections in the pool (not just one connection)
 * - Safe to call multiple times (idempotent)
 * 
 * Lifecycle Management:
 * - Should be called during application shutdown (SIGTERM/SIGINT handlers)
 * - Required for clean container shutdown in orchestrated environments
 * - Prevents "connection refused" errors in logs during pod termination
 * 
 * Usage Pattern:
 * ```typescript
 * process.on('SIGTERM', async () => {
 *   await disconnectMongo();
 *   await disconnectRedis();
 *   process.exit(0);
 * });
 * ```
 * 
 * @returns {Promise<void>} Resolves when all connections are closed
 */
export const disconnectMongo = async () => {
     await mongoose.connection.close()
     logger.info("Mongoose connection closed")
}