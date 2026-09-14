import Redis from "ioredis";
import { logger } from "../utils/logger.util";

/**
 * Singleton Redis client instance.
 * 
 * Pattern: Lazy-initialized singleton to ensure single connection pool across the application.
 * 
 * Why singleton?
 * - Redis clients maintain connection pools internally (default: 1 connection for single instance)
 * - Creating multiple clients wastes resources and can exhaust connection limits
 * - Ensures consistent connection reuse across rate limiting, caching, and session management
 * - Prevents connection leak in high-concurrency scenarios
 * 
 * Lifecycle:
 * - Initialized on first getRedisClient() call
 * - Reused for all subsequent calls
 * - Explicitly closed via disconnectRedis() during graceful shutdown
 */
let redis: Redis | null = null;

/**
 * Retrieves or initializes the singleton Redis client.
 * 
 * Connection Strategy:
 * - Uses object-based configuration instead of URL to avoid credential encoding issues
 * - Credentials are passed as separate parameters (host, port, username, password)
 * - No need for URL encoding since special characters in passwords are handled natively
 * 
 * Security Notes:
 * - USERNAME and PASSWORD pulled from environment variables (never hardcoded)
 * - Falls back to empty string if not provided (for local dev without auth)
 * - Connection is lazy-loaded: only established when first request needs Redis
 * 
 * Connection Reuse:
 * - ioredis maintains internal connection pool and auto-reconnect logic
 * - Returns same instance across all calls, preventing redundant connections
 * - Thread-safe: all Redis commands are queued and executed sequentially
 * 
 * @returns {Redis} Singleton Redis client instance
 */
export const getRedisClient = () => {

  if (!redis) {
    const USERNAME = process.env.REDIS_USERNAME ?? "";
    const PASSWORD = process.env.REDIS_PASSWORD ?? "";
    const PORT = process.env.REDIS_PORT ?? "";
    const HOST = process.env.REDIS_HOST ?? "";

    /**
     * URL approach commented out to prevent credential injection vulnerabilities.
     * 
     * Why avoid URL strings?
     * - Special characters in passwords (e.g., @, :, /) break URL parsing
     * - Requires encodeURIComponent() which adds complexity and error surface
     * - URL parsing can fail silently with malformed credentials
     * 
     * Example problematic password: "p@ss:word/123"
     * - Would break: redis://user:p@ss:word/123@host:6379
     * - URL parser interprets @ and : as delimiters, not password characters
     */
    // const url = `redis://${USERNAME}:${PASSWORD}@${HOST}:${PORT}`;
    
    /**
     * Object-based configuration approach (recommended).
     * 
     * Advantages:
     * - No URL encoding required
     * - Explicit parameter passing prevents parsing ambiguity
     * - Type-safe with TypeScript
     * - Supports additional options (retryStrategy, reconnectOnError, etc.)
     */
    redis = new Redis(
      {
        host: HOST,
        port: parseInt(PORT, 10) || 6379, // Default Redis port if not specified
        password: PASSWORD,
        username: USERNAME
      }  
    )
    logger.info("Connected to redis")
  }

  return redis
}

/**
 * Gracefully disconnects the Redis client and cleans up resources.
 * 
 * Shutdown Strategy:
 * - Uses quit() instead of disconnect() for graceful shutdown
 * - quit() waits for pending commands to complete before closing
 * - disconnect() immediately closes connection (may lose in-flight commands)
 * 
 * Lifecycle Management:
 * - Should be called during application shutdown (SIGTERM/SIGINT handlers)
 * - Resets singleton instance to null to allow re-initialization if needed
 * - Prevents connection leak in test environments or hot-reload scenarios
 * 
 * Usage:
 * - Call in Express app shutdown hook
 * - Call in process signal handlers (SIGTERM, SIGINT)
 * - Call in Jest afterAll() for test cleanup
 * 
 * @returns {Promise<void>} Resolves when connection is fully closed
 */
export const disconnectRedis = async() => {
  if (redis) {
    await redis.quit()
    logger.info("Redis disconnected")
    redis = null
  }
}