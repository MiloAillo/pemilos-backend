import { json } from "stream/consumers"
import { getRedisClient } from "../configs/redis.config"
import { PostCandidateCreate } from "../dtos/candidate.dto"
import { createError } from "../exceptions/error.exception"
import { Candidate } from "../models/candidate.model"
import { User } from "../models/user.model"
import { RedisCandidateCache, Settings } from "../utils/types.util"
import { logger } from "../utils/logger.util"

export const candidateInsert = async (req: PostCandidateCreate) => {
     try {
          const result = await Candidate.insertOne(req)

          await getRedisClient().hdel("setting", "candidates")

          return result
     } catch (err) {
          throw err
     }
}

export const candidateGet = async () => {
     try {
          // implements caching.
          // first init, vars
          const redis = getRedisClient()

          // getting caches resource from redis.
          const cached = await redis.hget("setting", "candidates")

          if (cached) {
               // take the cached
               const parsed = JSON.parse(cached)
               logger.info("Candidates cached")
               // cast it, agar tertata rapi
               return parsed as RedisCandidateCache[]
          }

          // get candidate manually from db.
          const candidates = await Candidate.find().lean()

          // set the new cache
          await redis.hset("setting", "candidates", JSON.stringify(candidates))

          return candidates
     } catch (err) {
          throw err
     }
}

export const deleteCandidateById = async (id: string) => {
     try {
          await Candidate.deleteOne({
               _id: id
          })

          await getRedisClient().hdel("setting", "candidates")
     } catch (err) {
          throw err
     }
}