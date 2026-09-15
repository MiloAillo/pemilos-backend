import joi, {ObjectSchema} from "joi";

/**
 * DTO for authentication login request payload
 * 
 * Used for user authentication and session establishment
 */
export type PostAuthLogin = {
     username: string,
     password: string, // Plain text password (validated, then compared directly)
}

/**
 * Validation schema for login requests
 * 
 * Validation occurs at the DTO layer (request boundary) to:
 * - Reject malformed credentials before database lookup
 * - Prevent brute force with invalid formats
 * - Ensure password complexity requirements are met
 * - Provide clear error messages for authentication failures
 * 
 * Why validation at DTO layer:
 * - First line of defense against malformed input
 * - Reduces unnecessary database queries for invalid credentials
 * - Provides consistent error format across all endpoints
 * - Separates input validation from business logic (authentication)
 * 
 * Security considerations:
 * - Password complexity enforced: uppercase + lowercase + digit minimum
 * - Min 8 characters prevents weak passwords
 * - Max 60 characters prevents excessively long password strings
 * - Pattern validation happens before database lookup (prevents timing attacks)
 * - Username max length prevents buffer overflow and display issues
 * 
 * Password complexity rationale:
 * - At least one uppercase letter: increases keyspace, prevents all-lowercase
 * - At least one lowercase letter: increases keyspace, prevents all-uppercase
 * - At least one digit: increases keyspace, forces mixed character types
 * - No special character requirement: balance between security and usability
 * 
 * Note: This validation applies to login attempts. User creation may have
 * different (possibly stricter) password requirements in user.dto.ts
 * 
 * TODO: Consider rate limiting login attempts at middleware layer
 * TODO: Consider adding account lockout after N failed attempts
 */
export const postAuthLogin: ObjectSchema = joi.object().keys({
     // Username for authentication - must match username from registration
     // Max length prevents excessively long lookups
     username: joi.string().max(60).required(),
     
     // Password validation with complexity requirements
     // - Minimum 8 characters (industry standard for basic security)
     // - Maximum 60 characters (prevents abuse, no hashing performed)
     // - Must contain: uppercase letter, lowercase letter, and digit
     // - Pattern breakdown: (?=.*[a-z]) = has lowercase
     //                      (?=.*[A-Z]) = has uppercase  
     //                      (?=.*\d)    = has digit
     //                      .+          = any characters (length handled by min/max)
     password: joi.string().min(8).max(60).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/).required().messages({
          'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
     })
})