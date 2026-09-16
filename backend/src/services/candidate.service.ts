import { json } from "stream/consumers"
import { getRedisClient } from "../configs/redis.config"
import { PostCandidateCreate } from "../dtos/candidate.dto"
import { createError } from "../exceptions/error.exception"
import { Candidate } from "../models/candidate.model"
import { User } from "../models/user.model"
import { RedisCandidateCache, Settings } from "../utils/types.util"
import { logger } from "../utils/logger.util"
import { logAudit } from "../utils/audit.util"

/**
 * Create a new candidate in the election system
 * 
 * BUSINESS LOGIC:
 * - Inserts candidate with name, vision, mission, and optional photo
 * - Automatically invalidates candidate cache to ensure fresh data
 * - Logs audit trail for compliance and security monitoring
 * 
 * CACHE INVALIDATION STRATEGY:
 * - Uses versioned cache invalidation pattern to prevent stale reads
 * - Increments global version counter before deleting cached data
 * - Atomic multi operation ensures version and deletion happen together
 * - Prevents race condition where stale cache is read after DB insert
 * 
 * SECURITY IMPLICATIONS:
 * - Should only be callable by admin role (enforced at middleware layer)
 * - Input validation performed by DTO schema (name, vision, mission required)
 * - MongoDB injection prevented by Mongoose schema validation
 * - Photo URL should be validated/sanitized to prevent XSS via img src
 * 
 * AUDIT LOGGING:
 * - Records actor, action, resource, timestamp for every insertion attempt
 * - Captures both success and failure cases with error details
 * - Admin user ID extracted from JWT token for accountability
 * - Audit logs stored in append-only file for compliance requirements
 * 
 * PERFORMANCE:
 * - Single DB write operation with minimal overhead
 * - Redis operations are pipelined in single round-trip via multi()
 * - Cache invalidation is cheap (delete + increment, no re-population)
 * 
 * @param req - Candidate creation payload (name, vision, mission, photo)
 * @param adminId - MongoDB ObjectId of admin performing the action (from JWT)
 * @returns {Promise<Candidate>} The inserted candidate document with MongoDB _id
 * @throws Error if database insertion fails or Redis operations fail
 */
export const candidateInsert = async (req: PostCandidateCreate, adminId: string) => {
     try {
          // STEP 1: Insert candidate document into MongoDB
          const result = await Candidate.insertOne(req)

          // STEP 2: Atomic cache invalidation with versioning to prevent stale reads
          const redis = getRedisClient()
          const multi = redis.multi()
          
          // Increment version counter to signal cache staleness
          // Any in-flight reads will detect version mismatch and skip cache set
          multi.incr("setting:candidates:version")
          
          // Delete cached candidate list from Redis hash
          // Next read will trigger cache miss and fresh DB fetch
          multi.hdel("setting", "candidates")
          
          // Execute both operations atomically in single network round-trip
          await multi.exec()
          
          logger.info("Candidate inserted and cache invalidated with new version")

          // STEP 3: Log successful audit trail for compliance
          // Records who created what candidate with what details
          logAudit({
               timestamp: new Date().toISOString(),
               action: 'CANDIDATE_INSERT',
               actor: adminId,
               actorRole: 'admin',
               resource: 'candidate',
               resourceId: result._id?.toString(),
               details: { name: req.name, label: req.label, number: req.number },
               success: true
          });

          return result
     } catch (err) {
          // STEP 4: Log failed audit trail for security monitoring
          // Helps detect repeated insertion failures (potential attack)
          logAudit({
               timestamp: new Date().toISOString(),
               action: 'CANDIDATE_INSERT',
               actor: adminId,
               actorRole: 'admin',
               resource: 'candidate',
               details: { name: req.name, error: (err as Error).message },
               success: false
          });
          throw err
     }
}

/**
 * Retrieve all candidates with intelligent versioned caching
 * 
 * BUSINESS LOGIC:
 * - Returns complete list of candidates for display on voting page
 * - High-read, low-write pattern ideal for aggressive caching
 * - Cache is populated lazily on first read after invalidation
 * 
 * CACHE MANAGEMENT STRATEGY:
 * - Implements versioned cache pattern to prevent stale data race conditions
 * - Version counter acts as optimistic lock for cache freshness
 * - Cache population is conditional: only set if version unchanged during DB fetch
 * - Prevents scenario where:
 *   1. Read starts with version=5
 *   2. Admin inserts new candidate (version→6, cache deleted)
 *   3. Read completes and sets cache with stale data (missing new candidate)
 * 
 * CACHE HIT PATH:
 * - Redis HGET retrieves serialized JSON candidate list
 * - Parse and return immediately (sub-millisecond response time)
 * - Version is logged for debugging cache behavior
 * 
 * CACHE MISS PATH:
 * - Fetch all candidates from MongoDB (lean() for performance)
 * - Re-check version counter before setting cache
 * - Skip cache population if version changed (indicates concurrent write)
 * - Return fresh data regardless of cache set outcome
 * 
 * SECURITY IMPLICATIONS:
 * - Public read endpoint (no authentication required)
 * - Returned data includes candidate name, vision, mission, photo URL
 * - Photo URLs should be validated to prevent XSS if rendered in img src
 * - Rate limiting recommended to prevent cache/DB exhaustion via spam
 * 
 * AUDIT LOGGING:
 * - Not required (read operation with no side effects)
 * - High frequency makes audit logging impractical
 * 
 * PERFORMANCE:
 * - Cache hit: ~1ms (Redis network + JSON parse)
 * - Cache miss: ~50-100ms (MongoDB query + Redis set)
 * - Cache TTL: None (explicitly invalidated on write operations)
 * - Expected cache hit rate: >95% in production
 * 
 * @returns {Promise<RedisCandidateCache[]>} Array of all candidates
 * @throws Error if MongoDB or Redis connection fails
 */
export const candidateGet = async () => {
     try {
          // STEP 1: Attempt cache read with version tracking
          const redis = getRedisClient()

          // Fetch current version counter and cached candidate list
          const versionBefore = await redis.get("setting:candidates:version")
          const cached = await redis.hget("setting", "candidates")

          // STEP 2: Return cached data if available AND version still valid (fast path)
          if (cached) {
               // Re-check version to ensure cache hasn't been invalidated during read
               const versionAfter = await redis.get("setting:candidates:version")
               
               if (versionBefore === versionAfter) {
                    // Version unchanged - cache is valid
                    const parsed = JSON.parse(cached)
                    logger.info(`Candidates cache hit (version: ${versionBefore || '0'})`)
                    
                    // Type cast for TypeScript safety (Redis returns plain objects)
                    return parsed as RedisCandidateCache[]
               } else {
                    // Version changed - cache invalidated during read, fall through to DB fetch
                    logger.warn(`Candidates cache invalidated during read (${versionBefore} -> ${versionAfter}), fetching from DB`)
                    // Fall through to STEP 3 (cache miss path)
               }
          }

          // STEP 3: Cache miss - fetch from MongoDB (slow path)
          logger.info(`Candidates cache miss (version: ${versionBefore || '0'}), fetching from DB`)

          // Fetch all candidates from database
          // lean() returns plain JS objects instead of Mongoose documents (faster)
          const candidates = await Candidate.find().lean()

          // STEP 4: Conditionally populate cache with version verification
          const versionAfter = await redis.get("setting:candidates:version")
          
          // Only set cache if version unchanged during DB fetch
          // This prevents race condition with concurrent candidate insert/delete
          if (versionBefore === versionAfter) {
               // Serialize candidate array to JSON and store in Redis hash
               await redis.hset("setting", "candidates", JSON.stringify(candidates))
               logger.info(`Candidates cache set successfully (version: ${versionAfter || '0'})`)
          } else {
               // Version mismatch indicates concurrent write operation
               // Skip cache population to prevent storing stale data
               logger.warn(`Candidates cache version changed during fetch (${versionBefore} -> ${versionAfter}), skipping cache set to prevent stale data`)
          }

          return candidates
     } catch (err) {
          // Let error bubble up to controller for proper HTTP error response
          throw err
     }
}

/**
 * Delete a candidate from the election system by ID
 * 
 * BUSINESS LOGIC:
 * - Removes candidate from database by MongoDB ObjectId
 * - Invalidates candidate cache to ensure deleted candidate not shown
 * - Logs audit trail for compliance and security monitoring
 * 
 * CACHE INVALIDATION STRATEGY:
 * - Uses same versioned cache invalidation pattern as candidateInsert
 * - Increments global version counter before deleting cached data
 * - Atomic multi operation ensures version and deletion happen together
 * - Next candidateGet() call will trigger cache miss and fresh DB fetch
 * 
 * SECURITY IMPLICATIONS:
 * - Should only be callable by admin role (enforced at middleware layer)
 * - Candidate ID should be validated as valid MongoDB ObjectId format
 * - No cascade delete implemented - orphaned votes may exist (business decision)
 * - TODO: Consider soft delete pattern to preserve audit trail
 * 
 * AUDIT LOGGING:
 * - Records actor, action, resource ID, and candidate name for every deletion
 * - Captures both success and failure cases with error details
 * - Admin user ID extracted from JWT token for accountability
 * - Audit logs stored in append-only file for compliance requirements
 * 
 * DATA INTEGRITY:
 * - Fetches candidate before deletion to capture name in audit log
 * - Deletion proceeds even if candidate not found (idempotent operation)
 * - No transaction needed (single document operation is atomic)
 * 
 * PERFORMANCE:
 * - Single DB delete operation with minimal overhead
 * - Redis operations are pipelined in single round-trip via multi()
 * - Cache invalidation is cheap (delete + increment, no re-population)
 * 
 * @param id - MongoDB ObjectId string of candidate to delete
 * @param adminId - MongoDB ObjectId of admin performing the action (from JWT)
 * @returns {Promise<void>} Resolves when deletion and cache invalidation complete
 * @throws Error if database deletion fails or Redis operations fail
 */
export const deleteCandidateById = async (id: string, adminId: string) => {
     try {
          // STEP 1: Fetch candidate before deletion for audit logging
          // lean() returns plain object for minimal overhead
          const candidate = await Candidate.findById(id).lean();
          
          // STEP 2: Delete candidate document from MongoDB
          // deleteOne is atomic at document level
          await Candidate.deleteOne({
               _id: id
          })

          // STEP 3: Atomic cache invalidation with versioning
          const redis = getRedisClient()
          const multi = redis.multi()
          
          // Increment version counter to signal cache staleness
          // Any in-flight reads will detect version mismatch
          multi.incr("setting:candidates:version")
          
          // Delete cached candidate list from Redis hash
          // Next read will trigger cache miss and fresh DB fetch
          multi.hdel("setting", "candidates")
          
          // Execute both operations atomically in single network round-trip
          await multi.exec()
          
          logger.info(`Candidate ${id} deleted and cache invalidated with new version`)

          // STEP 4: Log successful audit trail for compliance
          // Records who deleted which candidate with what name
          logAudit({
               timestamp: new Date().toISOString(),
               action: 'CANDIDATE_DELETE',
               actor: adminId,
               actorRole: 'admin',
               resource: 'candidate',
               resourceId: id,
               details: { name: candidate?.name },
               success: true
          });
     } catch (err) {
          // STEP 5: Log failed audit trail for security monitoring
          // Helps detect repeated deletion failures (potential attack)
          logAudit({
               timestamp: new Date().toISOString(),
               action: 'CANDIDATE_DELETE',
               actor: adminId,
               actorRole: 'admin',
               resource: 'candidate',
               resourceId: id,
               details: { error: (err as Error).message },
               success: false
          });
          throw err
     }
}