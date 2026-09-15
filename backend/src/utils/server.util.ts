import { connectToMongoose, disconnectMongo } from "../configs/db.config";
import { disconnectRedis, getRedisClient } from "../configs/redis.config";
import { logger } from "./logger.util";
import { createServer, Server } from "http";
import express from "express"
import { RedisSettingCache } from "./types.util";

/**
 * Server lifecycle management utility
 * 
 * Purpose:
 * - Manages server bootstrap and graceful shutdown
 * - Ensures proper resource cleanup on process termination
 * - Initializes application-level dependencies (MongoDB, Redis, settings)
 * 
 * Design Pattern: Lifecycle Management
 * - Single source of truth for server instance
 * - Centralized cleanup logic prevents resource leaks
 * - Signal handlers ensure graceful shutdown in production environments
 */

// Module-level server instance for graceful shutdown access
// Held at module scope so signal handlers can reference it during cleanup
let server: Server;

/**
 * Bootstrap the application server and initialize dependencies
 * 
 * Execution order:
 * 1. Connect to MongoDB (blocking, exits on failure)
 * 2. Initialize Redis settings cache
 * 3. Create HTTP server
 * 4. Register graceful shutdown handlers for SIGINT, SIGTERM, unhandled errors
 * 
 * @param app - Express application instance
 * @param port - Port number to listen on
 * 
 * Signal handling:
 * - SIGINT: Ctrl+C in terminal
 * - SIGTERM: Kubernetes/Docker stop signal
 * - unhandledRejection: Unhandled promise rejections
 * - uncaughtException: Synchronous errors not caught by try/catch
 */
export async function bootstrap(app: express.Express, port: string) {
  // MongoDB is required for the app to function, fail fast if unavailable
  const mongoConnected = await connectToMongoose();
  
  // Initialize Redis cache with default voting settings
  await initSetting()
  
  if (!mongoConnected) {
    logger.error("Failed to connect to MongoDB. Exiting.");
    process.exit(1);
  }

  // Create HTTP server manually (not app.listen()) to enable manual shutdown control
  server = createServer(app);

  server.listen(port, () => {
    logger.info(`Server is running on port ${port}`);
  });

  // Graceful shutdown wrapper - closes all connections cleanly
  const cleanup = async () => {
    await shutdown(server);
  };

  // Handle container orchestration termination (Docker, K8s)
  process.on("SIGINT", cleanup);   // Ctrl+C
  process.on("SIGTERM", cleanup);  // docker stop, kill command

  // Handle programmer errors that escape error boundaries
  // These should never happen in production, but we clean up anyway
  process.on("unhandledRejection", async (reason: any) => {
    logger.error("Unhandled Rejection:", reason);
    await cleanup();
  });

  process.on("uncaughtException", async (err: Error) => {
    logger.error("Uncaught Exception:", err);
    await cleanup();
  });
}

/**
 * Graceful shutdown sequence
 * 
 * Order matters:
 * 1. Stop accepting new HTTP connections
 * 2. Close database connections (MongoDB)
 * 3. Close cache connections (Redis)
 * 
 * Why this order?
 * - HTTP server stops first to prevent new requests during DB shutdown
 * - MongoDB disconnects before Redis because active requests may still write to Redis
 * - Clean exit codes signal container orchestrators (0 = success, 1 = error)
 * 
 * @param server - HTTP server instance to shut down
 */
export const shutdown = async (server: Server) => {
  logger.info("Starting graceful shutdown...");

  try {
    // Stop accepting new connections, wait for existing requests to complete
    logger.info("Closing HTTP server...");
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Close MongoDB connection pool
    logger.info("Disconnecting MongoDB...");
    await disconnectMongo();

    // Close Redis client connection
    logger.info("Disconnecting Redis...");
    await disconnectRedis();

    logger.info("Shutdown complete. Bye!");
    process.exit(0); // Signal success to process manager
  } catch (err) {
    logger.error("Error during shutdown:", err);
    process.exit(1); // Signal failure to process manager
  }
};


/**
 * Initialize application settings cache in Redis
 * 
 * IMPORTANT: Only sets defaults when fields don't exist
 * - Preserves existing values across server restarts
 * - Prevents unauthorized voting re-enablement after deployment
 * - Default: voting disabled (fail-safe behavior)
 * 
 * Why Redis?
 * - Settings are read on every vote validation (high frequency)
 * - Redis provides <1ms reads vs MongoDB's ~10-50ms
 * - Reduces database load for frequently accessed configuration
 * 
 * Security Rationale:
 * - Admin's voting toggle decision persists across restarts
 * - No accidental election reopening after server restart/deployment
 * - Fail-safe: requires explicit admin action to enable voting
 * 
 * Implementation:
 * - Uses HEXISTS to check field existence before setting
 * - Preserves admin configuration (toggle state, candidate cache)
 * - Logs whether default applied or existing value preserved
 * 
 * Hash structure in Redis:
 *   Key: "setting"
 *   Fields:
 *     - isVotingAllowed: "true" | "false" (string because Redis stores strings)
 *     - candidates: JSON string of candidate array (serialized for storage)
 * 
 * Why hash over string?
 * - Atomic field updates without reading entire setting object
 * - Can update isVotingAllowed without touching candidates list
 * 
 * @returns Promise<void>
 */
export const initSetting = async () => {
  const redis = getRedisClient()

  const key = "setting";

  // Default settings (applied only when fields don't already exist)
  // Preserves admin's previous configuration across server restarts
  const defaultSettings: RedisSettingCache = {
    isVotingAllowed: "false",  // Disabled by default (fail-safe)
    candidates: ""             // Empty until candidates are loaded via admin API
  }

  // Check if isVotingAllowed field exists
  const votingFieldExists = await redis.hexists(key, "isVotingAllowed");
  
  if (!votingFieldExists) {
    // Only set default if field doesn't exist (first run or Redis cleared)
    await redis.hset(key, "isVotingAllowed", defaultSettings.isVotingAllowed);
    logger.info("Initialized isVotingAllowed to 'false' (voting disabled by default)");
  } else {
    // Preserve existing value set by admin
    const currentValue = await redis.hget(key, "isVotingAllowed");
    logger.info(`Preserved existing isVotingAllowed: ${currentValue}`);
  }

  // Check if candidates field exists
  const candidatesFieldExists = await redis.hexists(key, "candidates");
  
  if (!candidatesFieldExists) {
    // Initialize empty candidates list
    await redis.hset(key, "candidates", defaultSettings.candidates);
    logger.info("Initialized candidates to empty string");
  } else {
    // Preserve existing candidate cache
    logger.info("Preserved existing candidates cache");
  }

  logger.info("Setting initialization completed")

  return
}