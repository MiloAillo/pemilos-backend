import Redis from "ioredis";
import { logger } from "../utils/logger.util";

let redis: Redis | null = null;

export const getRedisClient = () => {

  if (!redis) {
    const USERNAME = process.env.REDIS_USERNAME ?? "";
    const PASSWORD = process.env.REDIS_PASSWORD ?? "";
    const PORT = process.env.REDIS_PORT ?? "";
    const HOST = process.env.REDIS_HOST ?? "";

    // const url = `redis://${USERNAME}:${PASSWORD}@${HOST}:${PORT}`;
    
    redis = new Redis(
      {
        host: HOST,
        port: parseInt(PORT, 10) || 6379,
        password: PASSWORD,
        username: USERNAME
      }  
    )
    logger.info("Connected to redis")
  }

  return redis
}

export const disconnectRedis = async() => {
  if (redis) {
    await redis.quit()
    logger.info("Redis disconnected")
    redis = null
  }
}