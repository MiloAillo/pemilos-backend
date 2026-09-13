import { getRedisClient } from "../configs/redis.config";
import { MiddlewareHandler } from "../utils/types.util";
import { logger } from "../utils/logger.util";

// this rate limit just limits the backend application and not both.
// for the frontend i most likely will use something like nginx rate limiter.

// This sliding window algorithm utilize, Redis' ZSET (Sorted set)
// To organize the request history.
export const rateLimitMiddleware: MiddlewareHandler = async (req, res, next) => {
     
     // Checks and casts the provided env
     const WINDOW_SIZE_IN_SECONDS = +String(process.env.WINDOW_SIZE_IN_SECONDS) || 60;
     const MAX_REQUESTS = +String(process.env.MAX_REQUESTS) || 100;

     // Create redis client first
     const redis = getRedisClient()

     const trustProxy = process.env.TRUST_PROXY === 'true';
     let userIp = req.ip || 'unknown';
     
     if (trustProxy && req.headers['cf-connecting-ip']) {
          userIp = req.headers['cf-connecting-ip'] as string;
     } else if (req.headers['x-forwarded-for']) {
          const forwardedIps = (req.headers['x-forwarded-for'] as string).split(',');
          userIp = forwardedIps[0].trim();
     }
     
     if (userIp === 'unknown' && req.socket.remoteAddress) {
          userIp = req.socket.remoteAddress;
     }

     const key = `rate-limit:${userIp}`
     const now = Date.now()
     const windowStart = now - (WINDOW_SIZE_IN_SECONDS * 1000)

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
          const result = await redis.eval(
               luaScript,
               1,
               key,
               now.toString(),
               windowStart.toString(),
               MAX_REQUESTS.toString(),
               WINDOW_SIZE_IN_SECONDS.toString()
          ) as number;

          if (result === 0) {
               res.status(429).json({
                    "status": "failed",
                    "message": "too many request"
               })
               return
          }

          next()
     } catch (err) {
          logger.error('Rate limit error:', err);
          next()
     }
}