import joi, { ObjectSchema } from "joi"

/**
 * Vote DTO Module
 * 
 * Naming convention: methodActionModel
 * Example: Post(method) + Insert(action) + Vote(model) = PostInsertVote
 * 
 * BREAKING CHANGE: Vote payload now uses MongoDB ObjectID strings instead of 
 * candidate numbers. This change enables:
 * - Direct database references without additional lookups
 * - Prevention of race conditions when candidate numbers change
 * - Stronger referential integrity
 * 
 * Migration impact: Client applications must resolve candidate numbers to 
 * ObjectIDs before submitting votes
 */

/**
 * DTO for vote submission request payload
 * 
 * Represents a user's vote for both OSIS and MPK positions
 * Both fields are required - partial votes are not permitted
 */
export type PostInsertVote = {
     osis: string, // MongoDB ObjectID of OSIS candidate as hex string
     mpk: string   // MongoDB ObjectID of MPK candidate as hex string
}

/**
 * Validation schema for vote submission
 * 
 * Validation occurs at the DTO layer (request boundary) to:
 * - Reject malformed ObjectIDs before database operations
 * - Prevent NoSQL injection through strict format validation
 * - Ensure both votes are present (no partial voting)
 * 
 * Security considerations:
 * - ObjectID format validation (24 hexadecimal characters) prevents injection
 * - Hex-only characters prevent special characters or script injection
 * - Length enforcement (exactly 24 chars) rejects truncated or padded IDs
 * - Both fields required prevents incomplete vote records
 * 
 * Why ObjectIDs instead of numbers:
 * - Previous implementation used candidate.number field (1, 2, 3, etc.)
 * - Changed to ObjectIDs to eliminate lookup overhead and improve integrity
 * - Direct reference prevents issues if candidate numbers are renumbered
 * - Enables atomic database operations without additional queries
 * 
 * MongoDB ObjectID format:
 * - 12-byte identifier represented as 24 hexadecimal characters
 * - Example: "507f1f77bcf86cd799439011"
 * - Format: timestamp(4) + machineId(3) + processId(2) + counter(3)
 */
export const postInsertVote: ObjectSchema = joi.object().keys({
     // OSIS candidate ObjectID - must be valid 24-character hex string
     // Example: "507f1f77bcf86cd799439011"
     osis: joi.string().hex().length(24).required(),
     
     // MPK candidate ObjectID - must be valid 24-character hex string
     // Example: "507f191e810c19729de860ea"
     mpk: joi.string().hex().length(24).required()
})

/**
 * DTO for vote reset operation
 * 
 * Allows admin to reset a user's vote status, enabling them to vote again
 * Used for error correction or special circumstances
 */
export type DeleteResetVote = {
     username: string // Username of the user whose vote should be reset
}

/**
 * Validation schema for vote reset operation
 * 
 * Security considerations:
 * - This operation should be restricted to admin users only (enforced by middleware)
 * - No additional validation needed as username existence is verified by service layer
 * - Username is required to prevent accidental bulk resets
 */
export const deleteResetVote = joi.object().keys({
     // Username of user whose vote status will be reset
     // User must exist or operation will fail at service layer
     username: joi.string().required()
})