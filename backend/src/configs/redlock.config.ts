import Redlock from "redlock";
import { logger } from "../utils/logger.util";
import { getRedisClient } from "./redis.config";

let redlock: Redlock | null = null;

export const getRedlock = () => {
     if (!redlock) {
          redlock = new Redlock([getRedisClient()], {
               retryCount: 20,
               retryDelay: 100,
               retryJitter: 200
          })
          logger.info("Redlock configured")
     }
     return redlock
}