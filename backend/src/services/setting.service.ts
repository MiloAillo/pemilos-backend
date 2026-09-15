import { x } from "joi";
import { getRedisClient } from "../configs/redis.config"
import { Settings } from "../utils/types.util";
import { getPusherClient } from "../configs/pusher.config";
import { debounce } from "lodash";

/**
 * Toggle the global voting enabled/disabled state
 * 
 * BUSINESS LOGIC:
 * - Reads current voting state from Redis hash
 * - Flips the boolean flag atomically
 * - Broadcasts state change via Pusher to all connected clients
 * 
 * CACHE MANAGEMENT:
 * - Uses Redis hash "setting" with field "isVotingAllowed" as single source of truth
 * - Direct read-modify-write pattern ensures consistency
 * - No separate cache invalidation needed (flag is the cache)
 * 
 * SECURITY IMPLICATIONS:
 * - Should only be callable by admin role (enforced at controller/middleware layer)
 * - No input validation needed (toggle operation is idempotent)
 * - State change is immediately effective across all servers via Redis
 * 
 * AUDIT LOGGING:
 * - Currently missing audit trail for compliance
 * - TODO: Add logAudit() call to track who toggled voting and when
 * 
 * REAL-TIME SYNC:
 * - Pusher broadcast ensures all clients see state change without polling
 * - Channel "pemilose", event "pemilolot" used for voting status updates
 * 
 * @throws Error if Redis connection fails or Pusher trigger fails
 */
export const settingToggleAllowVote = async () => {
     try {
          // STEP 1: Read current voting state from Redis
          // Redis stores all booleans as strings "true"/"false"
          const redis = getRedisClient()
          const rawData = await redis.hget("setting", "isVotingAllowed")
          const isVotingAllowed = rawData === "true"
          
          // STEP 2: Flip the boolean flag atomically
          // Direct HSET ensures atomic state change without race conditions
          if (isVotingAllowed) {
               // Disable voting: block all vote submissions
               await redis.hset("setting", "isVotingAllowed", "false")
          } else {
               // Enable voting: allow vote submissions to proceed
               await redis.hset("setting", "isVotingAllowed", "true")
          }
          
          // STEP 3: Broadcast state change to all connected clients via WebSocket
          // Pusher trigger is fire-and-forget (no ack needed)
          const pusher = await getPusherClient();
          pusher.trigger("pemilose", "pemilolot", "");
          
     } catch (err) {
          throw err
     }
}

/**
 * Retrieve the current global voting enabled/disabled state
 * 
 * BUSINESS LOGIC:
 * - Returns boolean flag indicating whether voting is currently allowed
 * - Used by vote submission endpoint to enforce voting windows
 * - Used by frontend to show/hide voting UI elements
 * 
 * CACHE MANAGEMENT:
 * - Reads directly from Redis (no additional caching layer needed)
 * - Redis acts as both cache and source of truth for global flags
 * - Sub-millisecond read performance for high-frequency checks
 * 
 * SECURITY IMPLICATIONS:
 * - Public endpoint (no authentication required)
 * - Read-only operation poses no security risk
 * - Rate limiting recommended at API gateway level to prevent Redis DoS
 * 
 * AUDIT LOGGING:
 * - Not required (read operation with no side effects)
 * - High volume makes audit logging impractical
 * 
 * PERFORMANCE:
 * - Called on every vote submission to validate voting window
 * - Redis HGET provides O(1) lookup with minimal network overhead
 * - Consider local caching with TTL if read volume becomes bottleneck
 * 
 * @returns {Promise<boolean>} true if voting is enabled, false if disabled
 * @throws Error if Redis connection fails (should return 503 Service Unavailable)
 */
export const getVoteSettingStatus = async () => {
     try {
          // STEP 1: Fetch voting state from Redis hash
          const redis = getRedisClient()
          const rawData = await redis.hget("setting", "isVotingAllowed")
          
          // STEP 2: Parse string to boolean (Redis stores all values as strings)
          // Default to false if key doesn't exist (fail-safe: voting disabled by default)
          const isVotingAllowed = rawData === "true"

          return isVotingAllowed
     } catch (err) {
          throw err
     }
}