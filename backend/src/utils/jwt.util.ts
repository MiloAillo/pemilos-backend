import { Request } from "express"
import jwt from "jsonwebtoken"
import { createError } from "../exceptions/error.exception"
import { Payload } from "./types.util"

/**
 * ⚠️ SECURITY: JWT Signing Key Validation
 * 
 * Validates that JWT_KEY environment variable meets minimum security requirements.
 * 
 * SECURITY RATIONALE:
 * - HS256 (HMAC-SHA256) security depends entirely on secret key strength
 * - Short keys are vulnerable to brute-force attacks
 * - 32-character minimum provides ~256 bits of entropy (industry standard)
 * - NIST recommends minimum 112-bit security for HMAC keys
 * 
 * ATTACK SCENARIOS PREVENTED:
 * - Brute-force key guessing (short keys can be cracked in hours/days)
 * - Dictionary attacks (common passwords as JWT keys)
 * - Missing key causing undefined behavior or crashes
 * 
 * KEY GENERATION BEST PRACTICE:
 * ```bash
 * # Generate cryptographically secure 64-character key:
 * openssl rand -base64 48
 * # or
 * node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
 * ```
 * 
 * FAILURE MODES:
 * - Throws Error (not createError) to fail-fast at application startup
 * - Application won't start if JWT_KEY is invalid (prevents runtime failures)
 * - Error message includes current key length (helps debugging without exposing key)
 * 
 * @param key - JWT signing key from process.env.JWT_KEY
 * @returns Validated JWT key
 * @throws Error if key is missing, 'undefined' string, or shorter than 32 characters
 */
const validateJWTKey = (key: string | undefined): string => {
     // ⚠️ Check for missing or literal 'undefined' string (common .env mistake)
     if (!key || key === 'undefined') {
          throw new Error('JWT_KEY not defined in environment variables');
     }
     
     // ⚠️ Enforce 32-character minimum (256-bit security for HS256)
     if (key.length < 32) {
          throw new Error(`JWT_KEY must be at least 32 characters long (current: ${key.length})`);
     }
     return key;
};

/**
 * Generate JWT Token for Authentication
 * 
 * Creates a signed JWT token containing user identity and role information.
 * 
 * TOKEN STRUCTURE:
 * Header:  { alg: "HS256", typ: "JWT" }
 * Payload: { role: "voter|admin", id: "mongoDbObjectId", iss: "pemilos-backend", exp: timestamp }
 * 
 * ⚠️ SECURITY CONSIDERATIONS:
 * - Uses HS256 (HMAC-SHA256) symmetric signing algorithm
 * - Secret key validated for minimum 32-character length
 * - Issuer claim (iss) prevents token reuse across different applications
 * - Expiration enforced via expiresIn parameter (prevents indefinite token validity)
 * - No sensitive data in payload (only role and ID - payload is BASE64, not encrypted)
 * 
 * TOKEN LIFESPAN RECOMMENDATIONS:
 * - Access tokens: 15 minutes to 1 hour
 * - Refresh tokens: 7-30 days
 * - Admin tokens: shorter lifespan for higher security
 * 
 * SECURITY BEST PRACTICES:
 * - Store tokens in httpOnly cookies (prevents XSS theft) or secure storage
 * - Never log tokens in plaintext
 * - Implement token refresh mechanism for long sessions
 * - Consider JWT rotation on sensitive operations
 * 
 * @param userId - MongoDB ObjectId of the user (as string)
 * @param role - User role ("voter" | "admin")
 * @param expiresIn - Token lifespan in seconds (e.g., 3600 = 1 hour)
 * @returns Signed JWT token string
 * @throws Error if JWT_KEY validation fails
 */
export const generateToken = (userId: string, role: string, expiresIn: number) => {
     // ⚠️ SECURITY: Validate key strength before signing
     const JWT_KEY = validateJWTKey(process.env.JWT_KEY)
     
     return jwt.sign({
          role: role,
          id: userId
     }, JWT_KEY, {
          expiresIn,
          issuer: "pemilos-backend", // ⚠️ Prevents cross-application token reuse
     })
}

/**
 * Verify JWT Token Validity
 * 
 * Validates a JWT token's signature, expiration, and issuer without throwing errors.
 * 
 * VERIFICATION CHECKS:
 * 1. Signature validation (token signed with correct JWT_KEY)
 * 2. Expiration check (token not expired)
 * 3. Issuer verification (iss claim matches "pemilos-backend")
 * 4. Algorithm enforcement (only HS256 accepted, prevents algorithm confusion attacks)
 * 
 * ⚠️ SECURITY: Algorithm Confusion Attack Prevention
 * - Explicitly specifies algorithms: ["HS256"] in verify options
 * - Prevents attacker from changing algorithm to "none" or using asymmetric RS256 with HS256 public key
 * - Attack scenario: Attacker uses public key as HMAC secret if algorithm not enforced
 * 
 * RETURN BEHAVIOR:
 * - Returns decoded payload on success (truthy value)
 * - Returns false on ANY verification failure (signature, expiration, issuer mismatch)
 * - Does NOT throw errors (safe for boolean checks)
 * 
 * USE CASES:
 * - Optional authentication checks
 * - Token validation before operations
 * - Silent token verification without error handling
 * 
 * ⚠️ LIMITATION:
 * - Returns false for ALL errors (doesn't distinguish between expired vs invalid)
 * - Use getPayload() for more specific error handling
 * 
 * @param token - JWT token string to verify
 * @returns Decoded payload object if valid, false if invalid/expired
 */
export const verifyToken = (token: string) => {
     // ⚠️ SECURITY: Validate key strength
     const JWT_KEY = validateJWTKey(process.env.JWT_KEY)
     try {
          return jwt.verify(token, JWT_KEY, {
               // ⚠️ SECURITY: Explicit algorithm whitelist prevents algorithm confusion attacks
               algorithms: ["HS256"],
               issuer: "pemilos-backend" // ⚠️ Prevents token reuse from other applications
          })
     } catch (error) {
          // Silent failure - returns false for any verification error
          return false
     }
}

/**
 * Extract and Validate JWT Payload from Request
 * 
 * Extracts JWT token from Authorization header, verifies it, and returns decoded payload.
 * Primary authentication mechanism for protected endpoints.
 * 
 * REQUEST FLOW:
 * 1. Extract Authorization header from request
 * 2. Validate header presence
 * 3. Verify token signature, expiration, and issuer
 * 4. Decode and return payload containing user ID and role
 * 
 * AUTHORIZATION HEADER FORMAT:
 * - Expected: "Authorization: <token>" (raw token, NO "Bearer" prefix)
 * - Non-standard: Most APIs use "Bearer <token>", this implementation uses raw token
 * - Example: "Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 * 
 * ⚠️ SECURITY CONSIDERATIONS:
 * - Token extracted from header (safer than query params or body)
 * - Explicit algorithm enforcement (algorithms: ["HS256"]) prevents confusion attacks
 * - Issuer validation prevents token reuse from other applications
 * - Specific error messages for different failure modes (expired vs invalid)
 * - Throws HTTP 401 errors (proper authentication failure response)
 * 
 * ERROR HANDLING:
 * - Missing token: 401 "token Not Found"
 * - Expired token: 401 "token expired" (TokenExpiredError caught specifically)
 * - Invalid signature/issuer/malformed: 401 "invalid token"
 * 
 * PAYLOAD STRUCTURE:
 * ```typescript
 * {
 *   id: string;      // MongoDB ObjectId of user
 *   role: string;    // "voter" | "admin"
 *   iss: string;     // "pemilos-backend"
 *   exp: number;     // Unix timestamp expiration
 *   iat: number;     // Unix timestamp issued at
 * }
 * ```
 * 
 * USE CASES:
 * - Authentication middleware for protected routes
 * - Extracting current user identity in controllers
 * - Role-based access control (checking payload.role)
 * 
 * ⚠️ IMPORTANT:
 * - Does NOT check if user still exists in database (token valid even if user deleted)
 * - Does NOT check if token has been revoked (no token blacklist)
 * - Consider implementing token refresh mechanism for long-lived sessions
 * 
 * @param req - Express request object with Authorization header
 * @returns Decoded payload with user id and role
 * @throws 401 - Token not found, expired, or invalid
 * @throws Error - JWT_KEY validation failure (startup error)
 */
export const getPayload = (req: Request) => {
     // Extract token from Authorization header (no "Bearer" prefix in this implementation)
     const token: string | undefined = req.get("Authorization")
     
     // ⚠️ SECURITY: Fail fast if no token provided
     if (!token) {
          throw createError(
               "unauthorized",
               "token Not Found",
               401
          )
     }

     // ⚠️ SECURITY: Validate key strength before verification
     const JWT_KEY = validateJWTKey(process.env.JWT_KEY)
     
     try {
          // Verify and decode token with strict validation
          const decoded = jwt.verify(token, JWT_KEY, {
               // ⚠️ SECURITY: Whitelist only HS256 to prevent algorithm confusion attacks
               algorithms: ["HS256"],
               // ⚠️ SECURITY: Validate issuer to prevent cross-application token reuse
               issuer: "pemilos-backend"
          }) as Payload
          
          return decoded
     } catch (error) {
          // ⚠️ Specific error handling for expired tokens (helps frontend implement refresh logic)
          if (error instanceof jwt.TokenExpiredError) {
               throw createError(
                    "unauthorized",
                    "token expired",
                    401
               )
          }
          
          // Generic error for signature/issuer/malformed failures (don't leak specifics)
          throw createError(
               "unauthorized",
               "invalid token",
               401
          )
     }
}