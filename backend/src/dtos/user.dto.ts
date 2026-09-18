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
     
    // Plain text password (stored as-is, NOT hashed - by design)
    // Length: 5-30 characters (sufficient for temporary election credentials)
    password: joi.string().min(5).max(30).required(),
     
     // School class assignment - validated against CLASS constant
     // Previously named 'kelas' - renamed to 'class' for consistency
     class: joi.string().valid(...CLASS).required(),
     
     // User role determining access level and permissions
     role: joi.string().valid("voter", "admin").required()
})

/**
 * DTO for query parameters when fetching users with filters
 * 
 * All fields are optional to support flexible querying:
 * - Omitted fields = no filter applied for that field
 * - Empty string ("") = explicit "no filter" (returns all values for that field)
 * 
 * Examples:
 * - ?role=voter          → Only voters
 * - ?role=               → All roles (empty string means no filter)
 * - (no role param)      → All roles (undefined means no filter)
 */
export type GetUser = {
     name?: string,
     page?: number,
     isVoted?: boolean,
     class?: string | "", // Optional filter by school class, empty string allowed
     role?: "voter" | "admin" | ""  // Empty string allowed for "no filter"
}

/**
 * Validation schema for user query parameters
 * 
 * All fields are optional to support flexible filtering
 * Empty strings are allowed to indicate "no filter" (frontend requirement)
 * 
 * Security Enhancements:
 * - role: Whitelist validation (only "voter", "admin", or "" allowed)
 * - page: Bounds checking (1-10000) prevents DoS via massive skip offsets
 * - isVoted: Type validation prevents object injection
 * - class: Enum validation against CLASS constant, empty string allowed
 * - stripUnknown: Removes unexpected query parameters (parameter pollution prevention)
 * 
 * Type Coercion (via Joi convert: true):
 * - Query string "1" → number 1
 * - Query string "true" → boolean true
 * - Undefined → schema default values
 * 
 * Empty String Behavior (Frontend Requirement):
 * - Empty strings ("") in query parameters indicate "no filter"
 * - Example: ?class=&role= means "return all classes and roles"
 * - Service layer must handle empty strings by omitting those filters
 */
export const getUser: ObjectSchema = joi.object().keys({
    // Partial name match for search functionality
    // Empty string allowed (matches all names)
    // Default: empty string (no name filter)
    name: joi.string().allow("").optional().default(""),
    
    // Page number for pagination (1-indexed expected)
    // Bounds: 1-10000 prevents DoS via massive MongoDB skip offsets
    // Default: 1 (first page)
    page: joi.number().integer().min(1).max(10000).optional().default(1),
    
    // Filter by whether user has already voted
    // Type validation prevents NoSQL injection via {$exists: true}
    // Default: undefined (no filter applied)
    isVoted: joi.boolean().optional(),
    
    // Optional filter by school class - validated against CLASS enum
    // Empty string allowed to indicate "no class filter"
    // Prevents arbitrary class names from being queried
    class: joi.string().valid(...CLASS, "").optional(),
    
    // Filter by user role - whitelist validation prevents injection
    // Empty string allowed to indicate "no role filter"
    // Only "voter", "admin", or "" (no filter) allowed
    // Default: undefined (no default role filter - returns all roles)
    role: joi.string().valid("voter", "admin", "").optional()
}).options({
    // Strip unknown query parameters (security: prevents parameter pollution)
    stripUnknown: true
})

/**
 * Validation schema for fetching user by exact name
 * Used for single-user lookup operations
 */
export const getUserByName: ObjectSchema = joi.object().keys({
     // Exact name match required
     name: joi.string().required()
})