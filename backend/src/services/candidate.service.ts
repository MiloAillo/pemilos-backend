import { json } from "stream/consumers"
import { getRedisClient } from "../configs/redis.config"
import { PostCandidateCreate } from "../dtos/candidate.dto"
import { createError } from "../exceptions/error.exception"
import { Candidate } from "../models/candidate.model"
import { User } from "../models/user.model"
import { RedisCandidateCache, Settings } from "../utils/types.util"
import { logger } from "../utils/logger.util"
import { logAudit } from "../utils/audit.util"

export const candidateInsert = async (req: PostCandidateCreate) => {
     try {
          const result = await Candidate.insertOne(req)

          // Atomic cache invalidation with versioning
          const redis = getRedisClient()
          const multi = redis.multi()
          
          // Increment version counter
          multi.incr("setting:candidates:version")
          // Delete old cache
          multi.hdel("setting", "candidates")
          
          // Execute atomically
          await multi.exec()
          
          logger.info("Candidate inserted and cache invalidated with new version")

          logAudit({
               timestamp: new Date().toISOString(),
               action: 'CANDIDATE_INSERT',
               actor: 'system',
               actorRole: 'admin',
               resource: 'candidate',
               resourceId: result._id?.toString(),
               details: { name: req.name, vision: req.vision, mission: req.mission },
               success: true
          });

          return result
     } catch (err) {
          logAudit({
               timestamp: new Date().toISOString(),
               action: 'CANDIDATE_INSERT',
               actor: 'system',
               actorRole: 'admin',
               resource: 'candidate',
               details: { name: req.name, error: (err as Error).message },
               success: false
          });
          throw err
     }
}

export const candidateGet = async () => {
     try {
          // implements caching with version checking
          const redis = getRedisClient()

          // Get current version and cached data
          const versionBefore = await redis.get("setting:candidates:version")
          const cached = await redis.hget("setting", "candidates")

          if (cached) {
               // take the cached
               const parsed = JSON.parse(cached)
               logger.info(`Candidates cache hit (version: ${versionBefore || '0'})`)
               // cast it, agar tertata rapi
               return parsed as RedisCandidateCache[]
          }

          logger.info(`Candidates cache miss (version: ${versionBefore || '0'}), fetching from DB`)

          // get candidate manually from db.
          const candidates = await Candidate.find().lean()

          // Atomic cache set with version verification
          const versionAfter = await redis.get("setting:candidates:version")
          
          // Only set cache if version hasn't changed during DB fetch
          if (versionBefore === versionAfter) {
               await redis.hset("setting", "candidates", JSON.stringify(candidates))
               logger.info(`Candidates cache set successfully (version: ${versionAfter || '0'})`)
          } else {
               logger.warn(`Candidates cache version changed during fetch (${versionBefore} -> ${versionAfter}), skipping cache set to prevent stale data`)
          }

          return candidates
     } catch (err) {
          throw err
     }
}

export const deleteCandidateById = async (id: string) => {
     try {
          const candidate = await Candidate.findById(id).lean();
          await Candidate.deleteOne({
               _id: id
          })

          // Atomic cache invalidation with versioning
          const redis = getRedisClient()
          const multi = redis.multi()
          
          // Increment version counter
          multi.incr("setting:candidates:version")
          // Delete old cache
          multi.hdel("setting", "candidates")
          
          // Execute atomically
          await multi.exec()
          
          logger.info(`Candidate ${id} deleted and cache invalidated with new version`)

          logAudit({
               timestamp: new Date().toISOString(),
               action: 'CANDIDATE_DELETE',
               actor: 'system',
               actorRole: 'admin',
               resource: 'candidate',
               resourceId: id,
               details: { name: candidate?.name },
               success: true
          });
     } catch (err) {
          logAudit({
               timestamp: new Date().toISOString(),
               action: 'CANDIDATE_DELETE',
               actor: 'system',
               actorRole: 'admin',
               resource: 'candidate',
               resourceId: id,
               details: { error: (err as Error).message },
               success: false
          });
          throw err
     }
}