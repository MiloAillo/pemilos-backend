import { x } from "joi";
import { getRedisClient } from "../configs/redis.config"
import { Settings } from "../utils/types.util";
import { getPusherClient } from "../configs/pusher.config";
import { debounce } from "lodash";

export const settingToggleAllowVote = async () => {
     try {
          // Checks the setting, is voting allowed or nah
          const redis = getRedisClient()
          const rawData = await redis.hget("setting", "isVotingAllowed")
          const isVotingAllowed = rawData === "true"
          
          if (isVotingAllowed) {
               await redis.hset("setting", "isVotingAllowed", "false")
          } else {
               await redis.hset("setting", "isVotingAllowed", "true")
          }

          // trigger pusher
          const pusher = await getPusherClient();
          pusher.trigger("pemilose", "pemilolot", "");
          
     } catch (err) {
          throw err
     }
}

export const getVoteSettingStatus = async () => {
     try {
          const redis = getRedisClient()
          const rawData = await redis.hget("setting", "isVotingAllowed")
          const isVotingAllowed = rawData === "true"

          return isVotingAllowed
     } catch (err) {
          throw err
     }
}