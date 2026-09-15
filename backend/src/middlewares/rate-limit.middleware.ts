import { getRedisClient } from "../configs/redis.config";
import { MiddlewareHandler } from "../utils/types.util";
import { logger } from "../utils/logger.util";

/**
 * Rate Limiting Middleware
 * 
 * Scope: Backend API Only
 * - This rate limiter protects backend API endpoints (REST, GraphQL, etc.)
 * - Does NOT rate limit frontend static assets or CDN traffic
 * - For frontend protection, use upstream layer (Nginx, Cloudflare, AWS WAF)
 * 
 * Algorithm: Sliding Window Log
 * - Uses Redis ZSET (Sorted Set) to track request timestamps per IP
 * - More accurate than fixed window (prevents burst at window boundaries)
 * - More memory efficient than sliding window counter (stores timestamps, not counters)
 * 
 * How Sliding Window Works:
 * 1. Each request timestamp is added to ZSET with score = timestamp
 * 2. Old timestamps (outside current window) are removed
 * 3. Count remaining timestamps to check if limit exceeded
 * 4. If under limit, allow request and add new timestamp
 * 
 * Example (60s window, 100 req/min):
 * - 12:00:00 - 50 requests
 * - 12:00:30 - 50 requests (total 100, allowed)
 * - 12:00:45 - 1 request (101st, rejected)
 * - 12:01:01 - Requests from 12:00:00 expire, count drops to 51, new requests allowed
 * 
 * Redis Data Structure:
 * - Key: "rate-limit:192.168.1.1"
 * - Value: ZSET { 1694678400000: 1694678400000, 1694678401000: 1694678401000, ... }
 * - Score: Unix timestamp in milliseconds
 * - Member: Same timestamp (unique identifier for each request)
 */

/**
 * Express middleware that enforces rate limiting using Redis-backed sliding window.
 * 
 * Configuration (Environment Variables):
 * - WINDOW_SIZE_IN_SECONDS: Time window for rate limit (default: 60s)
 * - MAX_REQUESTS: Maximum requests allowed per window (default: 100)
 * - TRUST_PROXY: Enable trusted proxy header parsing (default: false)
 * 
 * IP Detection Priority:
 * 1. CF-Connecting-IP (if TRUST_PROXY=true and Cloudflare detected)
 * 2. X-Forwarded-For (first IP in chain)
 * 3. req.ip (Express default)
 * 4. req.socket.remoteAddress (fallback)
 * 
 * Response Codes:
 * - 429 Too Many Requests: Rate limit exceeded
 * - Passes to next() on success or Redis failure (fail open)
 * 
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next middleware function
 */
export const rateLimitMiddleware: MiddlewareHandler = async (req, res, next) => {
     
     /**
      * Load configuration from environment variables.
      * 
      * Type Coercion Strategy:
      * - +String() converts to number safely (handles undefined/null)
      * - Falls back to sensible defaults if env vars not set
      * 
      * Default Values:
      * - 60 seconds window = 1 minute (standard REST API rate limit)
      * - 100 requests/min = reasonable limit for authenticated users
      * - Adjust based on endpoint sensitivity (lower for auth, higher for reads)
      */
     const WINDOW_SIZE_IN_SECONDS = +String(process.env.WINDOW_SIZE_IN_SECONDS) || 60;
     const MAX_REQUESTS = +String(process.env.MAX_REQUESTS) || 100;

     /**
      * Get singleton Redis client.
      * 
      * Connection Reuse:
      * - getRedisClient() returns same instance across all requests
      * - Shares connection pool, preventing connection exhaustion
      * - ioredis handles command queueing and pipelining internally
      */
     const redis = getRedisClient()

     /**
      * IP Address Extraction with Proxy Support
      * 
      * Security Challenge: IP Spoofing
      * - Malicious clients can set X-Forwarded-For to arbitrary values
      * - Without proxy trust validation, attackers bypass rate limits by rotating fake IPs
      * 
      * Cloudflare CF-Connecting-IP:
      * - Cloudflare strips client-provided CF-Connecting-IP headers
      * - Replaces with actual client IP as seen by Cloudflare edge
      * - Most reliable when behind Cloudflare (cannot be spoofed)
      * - Only trusted when TRUST_PROXY=true (prevents abuse in non-Cloudflare deployments)
      * 
      * X-Forwarded-For:
      * - Format: "client-ip, proxy1-ip, proxy2-ip"
      * - First IP is original client (if proxies are trusted)
      * - Can be spoofed if not behind trusted proxy
      * - Use with caution: validate proxy infrastructure
      * 
      * Fallback Chain:
      * 1. CF-Connecting-IP (Cloudflare only, most secure)
      * 2. X-Forwarded-For (trusted proxy)
      * 3. req.ip (Express parsed IP)
      * 4. req.socket.remoteAddress (direct TCP connection)
      * 
      * TRUST_PROXY Configuration:
      * - Set to 'true' ONLY if behind Cloudflare, AWS ALB, Nginx, or other trusted proxy
      * - DO NOT enable if application is directly internet-facing
      * - If misconfigured, attackers can bypass rate limits with spoofed headers
      * 
      * Example Attack (TRUST_PROXY=true, no proxy):
      * - Attacker sets X-Forwarded-For: 1.1.1.1
      * - Rate limit key: "rate-limit:1.1.1.1"
      * - Attacker rotates IPs with each request, bypassing limits
      * 
      * Recommended Setup:
      * - Production (Cloudflare): TRUST_PROXY=true, use CF-Connecting-IP
      * - Production (ALB/Nginx): TRUST_PROXY=true, use X-Forwarded-For, configure proxy to strip client headers
      * - Development (direct): TRUST_PROXY=false, use req.socket.remoteAddress
      */
     const trustProxy = process.env.TRUST_PROXY === 'true';
     let userIp = req.ip || 'unknown';
     
     /**
      * Priority 1: Cloudflare CF-Connecting-IP
      * - Only use if TRUST_PROXY enabled (prevents header spoofing)
      * - Cloudflare guarantees this header reflects true client IP
      * - Cannot be forged by client (Cloudflare strips and replaces it)
      */
     if (trustProxy && req.headers['cf-connecting-ip']) {
          userIp = req.headers['cf-connecting-ip'] as string;
     } 
     /**
      * Priority 2: X-Forwarded-For (first IP in chain)
      * - Standard proxy header, may contain multiple IPs
      * - First IP is original client (subsequent IPs are proxy hops)
      * - Example: "203.0.113.1, 198.51.100.2, 192.0.2.1"
      * - Extract: "203.0.113.1" (client) vs "192.0.2.1" (last proxy)
      */
     else if (req.headers['x-forwarded-for']) {
          const forwardedIps = (req.headers['x-forwarded-for'] as string).split(',');
          userIp = forwardedIps[0].trim();
     }
     
     /**
      * Priority 3: Direct socket address (no proxy)
      * - Used when req.ip is 'unknown' (rare in Express)
      * - Reads IP from raw TCP socket connection
      * - Most reliable in non-proxied environments
      */
     if (userIp === 'unknown' && req.socket.remoteAddress) {
          userIp = req.socket.remoteAddress;
     }

     /**
      * Redis key namespacing for rate limit tracking.
      * 
      * Key Format: "rate-limit:{ip}"
      * - Namespacing prevents key collision with other Redis uses (sessions, cache)
      * - IP-based keying (alternative: user ID for authenticated endpoints)
      * 
      * Considerations:
      * - IP-based: Simple, works for anonymous users, can be bypassed with VPN/proxy rotation
      * - User-based: More accurate for authenticated endpoints, requires auth middleware first
      * - Hybrid: Combine both (rate-limit:ip:{ip} + rate-limit:user:{userId})
      */
     const key = `rate-limit:${userIp}`
     const now = Date.now()
     const windowStart = now - (WINDOW_SIZE_IN_SECONDS * 1000)

     /**
      * Lua Script for Atomic Rate Limit Check
      * 
      * Why Lua?
      * - Redis executes Lua scripts atomically (no race conditions)
      * - Multiple commands run as single atomic operation
      * - Prevents TOCTOU bugs (Time-Of-Check-Time-Of-Use)
      * 
      * Race Condition Without Lua:
      * 1. Client A: ZCARD key → 99
      * 2. Client B: ZCARD key → 99 (simultaneous)
      * 3. Client A: ZADD key → 100 (allowed)
      * 4. Client B: ZADD key → 101 (allowed, but should be rejected!)
      * 
      * Lua Solution:
      * - Entire check-and-set happens atomically
      * - Redis single-threaded execution prevents interleaving
      * 
      * Script Operations (in order):
      * 1. ZREMRANGEBYSCORE: Remove timestamps older than window start
      *    - Cleans up expired requests to prevent memory leak
      *    - Example: Remove all scores < (now - 60s)
      * 
      * 2. ZCARD: Count remaining timestamps in current window
      *    - Returns number of requests in last N seconds
      *    - O(1) operation (Redis maintains count internally)
      * 
      * 3. Check count >= maxRequests:
      *    - If at or over limit, return 0 (reject request)
      *    - If under limit, continue to step 4
      * 
      * 4. ZADD: Add current timestamp to sorted set
      *    - Score: current timestamp (for range queries)
      *    - Member: current timestamp (unique identifier)
      *    - Using timestamp as both score and member ensures uniqueness
      * 
      * 5. EXPIRE: Set TTL on key to prevent memory leak
      *    - Automatically delete key after window expires
      *    - Handles case where user stops making requests
      *    - TTL = WINDOW_SIZE (key expires after sliding window ends)
      * 
      * 6. Return 1: Request allowed
      * 
      * Arguments:
      * - KEYS[1]: Redis key (rate-limit:ip)
      * - ARGV[1]: Current timestamp (now)
      * - ARGV[2]: Window start timestamp (now - window size)
      * - ARGV[3]: Maximum allowed requests
      * - ARGV[4]: TTL for key (window size in seconds)
      * 
      * Return Values:
      * - 0: Rate limit exceeded, reject request
      * - 1: Rate limit OK, allow request
      */
     const luaScript = `
          local key = KEYS[1]
          local now = tonumber(ARGV[1])
          local windowStart = tonumber(ARGV[2])
          local maxRequests = tonumber(ARGV[3])
          local ttl = tonumber(ARGV[4])
          
          redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)
          local count = redis.call('ZCARD', key)
          
          if count >= maxRequests then
               return 0
          end
          
          redis.call('ZADD', key, now, now)
          redis.call('EXPIRE', key, ttl)
          return 1
     `;

     try {
          /**
           * Execute Lua script atomically in Redis.
           * 
           * redis.eval() Arguments:
           * 1. luaScript: Lua code to execute
           * 2. 1: Number of KEYS (not ARGV) - Redis protocol requirement
           * 3. key: KEYS[1] value
           * 4-7. now, windowStart, MAX_REQUESTS, WINDOW_SIZE: ARGV[1-4] values
           * 
           * toString() Conversion:
           * - Redis Lua requires string arguments
           * - Numbers are converted to strings for protocol transmission
           * - Lua script uses tonumber() to convert back
           * 
           * Type Assertion:
           * - redis.eval() returns RedisValue (string | number | Buffer | Array)
           * - We know script returns number (0 or 1), so cast as number
           */
          const result = await redis.eval(
               luaScript,
               1,
               key,
               now.toString(),
               windowStart.toString(),
               MAX_REQUESTS.toString(),
               WINDOW_SIZE_IN_SECONDS.toString()
          ) as number;

          /**
           * Rate limit exceeded (result === 0)
           * 
           * HTTP 429 Too Many Requests:
           * - Standard status code for rate limiting (RFC 6585)
           * - Client should implement exponential backoff
           * - Consider adding Retry-After header with seconds to wait
           * 
           * Security Note:
           * - Generic error message prevents information disclosure
           * - Does NOT reveal rate limit parameters (avoids helping attackers)
           * - For better UX, add X-RateLimit-* headers:
           *   - X-RateLimit-Limit: MAX_REQUESTS
           *   - X-RateLimit-Remaining: MAX_REQUESTS - count
           *   - X-RateLimit-Reset: Unix timestamp when limit resets
           */
          if (result === 0) {
               res.status(429).json({
                    "status": "failed",
                    "message": "too many request"
               })
               return
          }

          /**
           * Rate limit check passed, proceed to next middleware.
           */
          next()
     } catch (err) {
          /**
           * Error Handling: Fail Open Strategy
           * 
           * Fail Open vs Fail Closed:
           * - Fail Open: Allow request on Redis error (prioritizes availability)
           * - Fail Closed: Reject request on Redis error (prioritizes security)
           * 
           * Why Fail Open?
           * - Redis outage shouldn't break entire application
           * - Rate limiting is defense-in-depth, not primary security control
           * - Prevents cascading failures (Redis down → all requests rejected)
           * 
           * Trade-offs:
           * - During Redis outage, rate limits not enforced (DDoS risk)
           * - Alternative: Implement in-memory fallback rate limiter (node-rate-limiter-flexible)
           * 
           * Error Scenarios:
           * - Redis connection lost
           * - Redis out of memory
           * - Lua script syntax error (shouldn't happen in prod)
           * - Network partition between app and Redis
           * 
           * Monitoring:
           * - Log all rate limit errors for alerting
           * - Track error rate (high error rate = Redis issue)
           * - Set up PagerDuty/Opsgenie alerts for sustained errors
           */
          logger.error('Rate limit error:', err);
          next()
     }
}