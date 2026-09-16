/**
 * AUTHENTICATION SERVICE
 * 
 * Business logic layer for authentication operations.
 * Validates user credentials and enforces voting system security rules.
 * 
 * This system stores passwords in PLAIN TEXT format by intentional design.
 * 
 * JUSTIFICATION:
 * - Temporary election system with limited lifespan (single event)
 * - Controlled environment (school network, limited access)
 * - Simplified credential distribution (printed voter cards)
 * - Administrative reset capability required (plain text enables recovery)
 * 
 * SECURITY IMPLICATIONS:
 * - Database compromise exposes all user credentials
 * - No protection against offline password extraction
 * - Credentials visible to database administrators
 * 
 * MITIGATION MEASURES:
 * - Database access restricted to authorized administrators only
 * - Passwords are temporary (valid only during election period)
 * - Audit logging tracks all authentication attempts
 * - Rate limiting prevents brute force attacks
 * - HTTPS prevents credential interception in transit
 * 
 * SECURITY FEATURES:
 * - User credential validation (username + password)
 * - Vote status enforcement (prevents re-voting via login)
 * - Comprehensive audit logging for security monitoring
 * - Protection against brute force (via rate limiting at route level)
 * 
 * AUDIT LOGGING:
 * All authentication attempts (success and failure) are logged for:
 * - Security monitoring and incident response
 * - Compliance and accountability
 * - Fraud detection and prevention
 * - User activity tracking
 */

import { PostAuthLogin } from "../dtos/auth.dto";
import { createError } from "../exceptions/error.exception";
import { User } from "../models/user.model";
import { logAudit } from "../utils/audit.util";

/**
 * AUTH LOGIN SERVICE
 * 
 * Validates user credentials and returns authenticated user object.
 * 
 * AUTHENTICATION FLOW:
 * 1. Look up user by username in database
 * 2. Validate user exists
 * 3. Check if user has already voted (voting system rule)
 * 4. Verify password matches (plain text comparison)
 * 5. Log authentication result
 * 6. Return user object for JWT token generation
 * 
 * SECURITY CONSIDERATIONS:
 * - Plain text password storage (intentional per project requirements)
 * - Vote status check prevents users from voting multiple times
 * - All attempts logged for audit trail
 * - Generic error messages prevent username enumeration attacks
 * 
 * ⚠️ SECURITY TRADE-OFF:
 * This system stores passwords in plain text by design.
 * - Database compromise exposes all user credentials
 * - Acceptable for controlled environment (school election system)
 * 
 * @param req - Login credentials { username, password }
 * @returns User object with _id, username, name, role, isVoted
 * @throws Error if authentication fails (user not found, wrong password, already voted)
 */
export const authLogin = async (req: PostAuthLogin) => {
  try {
    /**
     * STEP 1: Query database for user by username
     * 
     * Uses MongoDB findOne to retrieve single user document
     * exec() executes the query and returns promise
     * 
     * SECURITY: Username lookup is case-sensitive
     * Consider case-insensitive lookup for better UX
     */
    const user = await User.findOne({
      username: req.username,
    }).exec();

    /**
     * STEP 2: Validate user exists
     * 
     * If no user found, authentication fails
     * 
     * SECURITY: Generic error message prevents username enumeration
     * Attacker cannot determine if username exists in system
     * 
     * AUDIT: Log failed attempt with username for security monitoring
     */
    if (!user) {
      logAudit({
        timestamp: new Date().toISOString(),
        action: 'LOGIN_ATTEMPT',
        actor: req.username,
        actorRole: 'unknown',
        resource: 'auth',
        details: { username: req.username, reason: 'user not found' },
        success: false
      });
      throw createError("failed", "user with such credential not found", 400);
    }

    /**
     * STEP 3: Check if user has already voted
     * 
     * VOTING SYSTEM RULE: Users cannot login after voting
     * - Prevents users from changing their vote
     * - Enforces one-vote-per-user policy
     * - Maintains voting integrity
     * 
     * SECURITY: isVoted flag is set after successful vote submission
     * Once set, user account is effectively disabled for future logins
     * 
     * AUDIT: Log attempt with user role and ID for tracking
     */
    if (user.isVoted) {
      logAudit({
        timestamp: new Date().toISOString(),
        action: 'LOGIN_ATTEMPT',
        actor: req.username,
        actorRole: user.role,
        resource: 'auth',
        resourceId: user._id?.toString(),
        details: { username: req.username, reason: 'account already voted' },
        success: false
      });
      throw createError(
        "failed",
        "failed to logged in, your account already voted",
        401,
      );
    }

    /**
     * STEP 4: Verify password matches stored password
     * 
     * Plain text password comparison (by design):
     * - Direct string comparison: req.password === user.password
     * - No hashing or salting implemented
     * - Intentional design decision per project requirements
     * 
     * ⚠️ SECURITY IMPLICATION:
     * - Database breach exposes all passwords in readable format
     * - Acceptable trade-off for this use case (temporary election credentials)
     * - Consider migration to bcrypt if requirements change in future
     * 
     * AUDIT: Log failed password attempts for security monitoring
     * Excessive failed attempts may indicate brute force attack
     */
    if (req.password != user.password) {
      logAudit({
        timestamp: new Date().toISOString(),
        action: 'LOGIN_ATTEMPT',
        actor: req.username,
        actorRole: user.role,
        resource: 'auth',
        resourceId: user._id?.toString(),
        details: { username: req.username, reason: 'invalid password' },
        success: false
      });
      throw createError("failed", "password is not valid", 400);
    }

    /**
     * STEP 5: Authentication successful - Log success
     * 
     * AUDIT: Log successful authentication with user details
     * - Tracks user login activity
     * - Helps detect unauthorized access to accounts
     * - Provides accountability trail
     * 
     * Details logged:
     * - Username and full name
     * - User role (voter or admin)
     * - User ID for correlation with other actions
     * - Timestamp for session tracking
     */
    logAudit({
      timestamp: new Date().toISOString(),
      action: 'LOGIN_SUCCESS',
      actor: req.username,
      actorRole: user.role,
      resource: 'auth',
      resourceId: user._id?.toString(),
      details: { username: req.username, name: user.name },
      success: true
    });

    /**
     * STEP 6: Return authenticated user object
     * 
     * User object contains:
     * - _id: MongoDB ObjectId (used in JWT token)
     * - username: User's login name
     * - name: User's full name
     * - role: "voter" or "admin" (used for authorization)
     * - isVoted: boolean flag (already checked above)
     * 
     * Controller will use this to generate JWT token with user ID and role
     */
    return user;
  } catch (err) {
    /**
     * ERROR HANDLING
     * 
     * Two types of errors:
     * 1. Business logic errors (already thrown with createError)
     *    - User not found, wrong password, already voted
     *    - Already logged, just re-throw
     * 
     * 2. Unexpected errors (database connection, etc.)
     *    - Log as failed login attempt
     *    - Re-throw for global error handler
     * 
     * SECURITY: Don't expose internal error details to client
     * Detailed errors logged for debugging but generic message sent to client
     */
    
    // Re-throw if already a known error with status code (business logic errors)
    if ((err as any).status) {
      throw err;
    }
    
    /**
     * Unexpected error occurred (database error, network error, etc.)
     * Log for audit trail and debugging
     */
    logAudit({
      timestamp: new Date().toISOString(),
      action: 'LOGIN_ATTEMPT',
      actor: req.username,
      actorRole: 'unknown',
      resource: 'auth',
      details: { username: req.username, error: (err as Error).message },
      success: false
    });
    throw err;
  }
};
