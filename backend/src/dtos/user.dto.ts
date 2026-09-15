import joi, { allow, ObjectSchema } from "joi"
import { CLASS } from "../utils/variables.util"

/**
 * DTO for user creation request payload
 * 
 * BREAKING CHANGE: Field name changed from 'kelas' to 'class' for consistency
 * with English naming convention across the codebase
 */
export type PostUserCreate = {
     name: string,
     username: string,
     password: string,
     class: string, // Previously 'kelas' - breaking change for API consumers
     role: "voter" | "admin"
}

/**
 * Validation schema for user creation
 * 
 * Validation occurs at the DTO layer (request boundary) to:
 * - Reject malformed input before business logic processing
 * - Provide consistent error messages to API consumers
 * - Prevent invalid data from reaching the database layer
 * 
 * Security considerations:
 * - Username length limits prevent excessive storage/display abuse
 * - Password min length enforces basic security (consider increasing to 8+ chars)
 * - Class validation against enum prevents injection of arbitrary data
 * - Role whitelist ensures only valid roles are assigned
 * 
 * Business rules:
 * - CLASS enum restricts valid school classes (defined in variables.util)
 * - Role must be either "voter" or "admin" - no other roles permitted
 * 
 * BREAKING CHANGE: 'class' field replaces 'kelas' field name
 */
export const postUserCreate: ObjectSchema = joi.object().keys({
     // Full name of the user - min 5 chars prevents single-letter names
     name: joi.string().min(5).max(60).required(),
     
     // Unique identifier for login - must be between 5-30 characters
     username: joi.string().min(5).max(30).required(),
     
     // Plain text password (will be hashed by service layer)
     // WARNING: Consider increasing min length to 8+ and adding complexity rules
     password: joi.string().min(5).max(30).required(),
     
     // School class assignment - validated against CLASS constant
     // Previously named 'kelas' - renamed to 'class' for consistency
     class: joi.string().valid(...CLASS).required(),
     
     // User role determining access level and permissions
     role: joi.string().valid("voter", "admin").required()
})

/**
 * DTO for user query/filter parameters
 * All fields are optional to support flexible filtering
 */
export type GetUser = {
     name: string
     page: number,
     isVoted: boolean,
     class?: string, // Optional filter by school class
     role: "voter" | "admin"
}

/**
 * Validation schema for user query parameters
 * 
 * All fields are optional - allows partial filtering by any combination
 * of name, pagination, vote status, class, or role
 */
export const getUser: ObjectSchema = joi.object().keys({
     // Partial name match for search functionality
     name: joi.string(),
     
     // Page number for pagination (1-indexed expected)
     page: joi.number(),
     
     // Filter by whether user has already voted
     isVoted: joi.boolean(),
     
     // Optional filter by school class - validated against CLASS enum
     class: joi.string().valid(...CLASS).optional(),
     
     // Filter by user role
     role: joi.string()
})

/**
 * Validation schema for fetching user by exact name
 * Used for single-user lookup operations
 */
export const getUserByName: ObjectSchema = joi.object().keys({
     // Exact name match required
     name: joi.string().required()
})