import Redlock from "redlock";
import { logger } from "../utils/logger.util";
import { getRedisClient } from "./redis.config";

/**
 * Redlock Configuration
 * 
 * Implements distributed locking using the Redlock algorithm to prevent race conditions
 * in high-concurrency scenarios, particularly during voting operations.
 * 
 * Use Cases:
 * - Preventing duplicate votes when multiple requests arrive simultaneously
 * - Ensuring atomic vote count updates across distributed servers
 * - Protecting critical sections during election result calculations
 * - Coordinating distributed operations that require mutual exclusion
 * 
 * How Redlock Works:
 * 1. Attempts to acquire lock across all Redis instances
 * 2. Lock is considered acquired if majority of instances grant it
 * 3. Automatically retries with exponential backoff + jitter
 * 4. Locks have TTL to prevent deadlocks if process crashes
 * 
 * Lock Naming Convention:
 * - Use descriptive, resource-specific lock keys (e.g., 'vote:user:123:election:456')
 * - Include resource type and unique identifiers
 * - Keep lock names consistent across codebase
 * 
 * Redis Cluster Setup:
 * - Currently uses single Redis instance (can be extended to multiple)
 * - For production: use 3 or 5 independent Redis instances
 * - Instances should be on different servers/availability zones
 * - More instances = higher fault tolerance
 * 
 * Retry Configuration:
 * - retryCount: Maximum attempts to acquire lock (20 attempts)
 * - retryDelay: Base delay between retries in milliseconds (100ms)
 * - retryJitter: Random delay added to prevent thundering herd (0-200ms)
 * - Total max retry time: ~20 * (100 + 100) = ~4 seconds
 * 
 * Lock Acquisition Pattern:
 * ```
 * const lock = await redlock.acquire(['vote:user:123'], 5000) // 5s TTL
 * try {
 *   // Critical section - process vote
 * } finally {
 *   await lock.release() // Always release in finally block
 * }
 * ```
 * 
 * Security Considerations:
 * - Always release locks in finally blocks to prevent deadlocks
 * - Set appropriate TTL based on operation duration (default: 5-10 seconds)
 * - Monitor lock wait times to detect contention issues
 * - Avoid holding locks during I/O operations when possible
 * - Use unique lock keys per resource to minimize contention
 * 
 * Performance Considerations:
 * - Lock acquisition adds latency (~100-200ms under contention)
 * - Higher retry counts increase maximum wait time
 * - Jitter prevents simultaneous retries from competing processes
 * - Monitor Redis connection pool to prevent bottlenecks
 * 
 * Error Handling:
 * - Throws error if lock cannot be acquired after all retries
 * - Caller must handle LockError and implement fallback logic
 * - Lock automatically released if process holding it crashes (TTL expires)
 * 
 * @see https://redis.io/docs/manual/patterns/distributed-locks/
 */

// Singleton instance to reuse Redlock across application lifecycle
// Prevents creating multiple Redlock instances with duplicate connections
let redlock: Redlock | null = null;

/**
 * Get or create Redlock instance
 * 
 * Uses singleton pattern to ensure only one Redlock instance exists.
 * Configures retry behavior for optimal balance between responsiveness
 * and success rate under contention.
 * 
 * @returns {Redlock} Configured Redlock instance
 */
export const getRedlock = () => {
     if (!redlock) {
          // Initialize Redlock with Redis client and retry configuration
          // Using array of Redis clients allows for multi-instance setup in future
          redlock = new Redlock([getRedisClient()], {
               // Maximum number of attempts to acquire lock before giving up
               // 20 attempts balances persistence with timeout prevention
               retryCount: 20,
               
               // Base delay between retry attempts in milliseconds
               // 100ms provides quick retries without overwhelming Redis
               retryDelay: 100,
               
               // Random jitter (0-200ms) added to retry delay
               // Prevents thundering herd when multiple processes retry simultaneously
               // Spreads out retry attempts for better success rate
               retryJitter: 200
          })
          logger.info("Redlock configured")
     }
     return redlock
}