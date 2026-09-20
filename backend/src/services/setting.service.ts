import { x } from "joi";
import { getRedisClient } from "../configs/redis.config"
import { Settings } from "../utils/types.util";
import { getPusherClient } from "../configs/pusher.config";
import { debounce } from "lodash";
import { logAudit } from "../utils/audit.util";
import { logger } from "../utils/logger.util";

/**
 * Toggle the global voting enabled/disabled state with atomic operation
 * 
 * BUSINESS LOGIC:
 * - Reads current voting state from Redis hash
 * - Flips the boolean flag atomically using Lua script
 * - Broadcasts state change via Pusher to all connected clients
 * - Logs audit trail for compliance and accountability
 * 
 * CACHE MANAGEMENT:
 * - Uses Redis hash "setting" with field "isVotingAllowed" as single source of truth
 * - Atomic toggle via Lua script prevents race conditions
 * - No separate cache invalidation needed (flag is the cache)
 * 
 * ATOMICITY:
 * - Lua script ensures read-modify-write happens atomically
 * - Prevents race condition where two concurrent toggles lose a state change
 * - Redis executes Lua scripts as single atomic operation
 * 
 * SECURITY IMPLICATIONS:
 * - Only callable by admin role (enforced at controller/middleware layer)
 * - Admin identity captured in audit log for accountability
 * - State change is immediately effective across all servers via Redis
 * 
 * AUDIT LOGGING:
 * - Records who toggled voting, when, and what state changed
 * - Captures previous and new state for complete audit trail
 * - Logs Pusher notification success/failure for debugging
 * - Critical for compliance and incident investigation
 * 
 * REAL-TIME SYNC:
 * - Pusher broadcast ensures all clients see state change without polling
 * - Channel "pemilose", event "pemilolot" used for voting status updates
 * - Pusher failure logged but doesn't fail the operation (graceful degradation)
 * 
 * @param adminId - MongoDB ObjectId of admin performing the toggle (from JWT)
 * @throws Error if Redis connection fails
 */
export const settingToggleAllowVote = async (adminId: string) => {
     try {
          // STEP 1: Atomic toggle using Lua script to prevent race conditions
          // Lua script executes as single atomic operation in Redis
          const redis = getRedisClient()
          
          // Lua script: Read current value, flip it, return both old and new values
          const luaScript = `
               local key = KEYS[1]
               local field = ARGV[1]
               local current = redis.call('HGET', key, field)
               local newValue
               if current == 'true' then
                    newValue = 'false'
               else
                    newValue = 'true'
               end
               redis.call('HSET', key, field, newValue)
               return {current, newValue}
          `
          
          // Execute Lua script atomically
          // Returns array: [previousValue, newValue]
          const result = await redis.eval(luaScript, 1, "setting", "isVotingAllowed") as string[]
          const previousState = result[0] === "true" ? "enabled" : "disabled"
          const newState = result[1] === "true" ? "enabled" : "disabled"
          
          logger.info(`Voting toggled from ${previousState} to ${newState} by admin ${adminId}`)
          
          // STEP 2: Broadcast state change to all connected clients via Pusher
          // Pusher failure is logged but doesn't fail the operation (graceful degradation)
          let pusherNotified = false
          try {
               const pusher = await getPusherClient();
               await pusher.trigger("pemilose", "pemilolot", "");
               pusherNotified = true
          } catch (pusherErr) {
               // Log Pusher failure but don't fail the operation
               // Frontend will eventually sync via polling
               logger.error(`Pusher notification failed: ${(pusherErr as Error).message}`)
          }
          
          // STEP 3: Log successful audit trail for compliance
          // Records who toggled voting, state transition, and Pusher status
          logAudit({
               timestamp: new Date().toISOString(),
               action: 'VOTING_TOGGLE',
               actor: adminId,
               actorRole: 'admin',
               resource: 'setting',
               resourceId: 'isVotingAllowed',
               details: {
                    previousState,
                    newState,
                    pusherNotified
               },
               success: true
          });
          
     } catch (err) {
          // STEP 4: Log failed audit trail for security monitoring
          logAudit({
               timestamp: new Date().toISOString(),
               action: 'VOTING_TOGGLE',
               actor: adminId,
               actorRole: 'admin',
               resource: 'setting',
               resourceId: 'isVotingAllowed',
               details: { error: (err as Error).message },
               success: false
          });
          throw err;
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
          throw err;
     }
}