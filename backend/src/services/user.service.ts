import { getUniqueHostnamesFromOptions } from "ioredis/built/cluster/util";
import { GetUser, PostUserCreate } from "../dtos/user.dto";
import { createError } from "../exceptions/error.exception";
import { User } from "../models/user.model";
import { logger } from "../utils/logger.util";
import { logAudit } from "../utils/audit.util";

/**
 * Sanitizes user input for MongoDB regex queries to prevent NoSQL injection attacks.
 * 
 * SECURITY RATIONALE:
 * MongoDB regex queries using $regex can be exploited if user input contains special regex characters.
 * 
 * ATTACK EXAMPLE:
 * Without sanitization, an attacker could inject: ".*" to match all users,
 * or use "^a.*" to enumerate users starting with 'a' for reconnaissance.
 * More sophisticated attacks could use regex complexity to cause ReDoS (Regular Expression Denial of Service).
 * 
 * PROTECTION MECHANISM:
 * Escapes all regex metacharacters: . * + ? ^ $ { } ( ) | [ ] \
 * Each special char is prefixed with backslash to treat it as literal text.
 * 
 * EXAMPLE:
 * Input:  "user.*@example"
 * Output: "user\\.\\*@example"
 * This searches for the literal string "user.*@example" instead of a regex pattern.
 * 
 * @param input - Raw user input string that will be used in a MongoDB $regex query
 * @returns Sanitized string with all regex special characters escaped
 */
const sanitizeRegex = (input: string): string => {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Creates a new user in the system with full audit logging.
 * 
 * BUSINESS LOGIC FLOW:
 * 1. Insert user document into MongoDB using Mongoose model
 * 2. Log successful creation to audit trail with all relevant metadata
 * 3. On failure, log the error to audit trail for compliance tracking
 * 4. Return the created user document with generated _id
 * 
 * AUDIT LOGGING:
 * Tracks WHO (actor/role), WHAT (action), WHEN (timestamp), WHERE (resource/resourceId),
 * and WHY (details). Critical for:
 * - Security incident investigation
 * - Compliance requirements (GDPR, SOC2, audit trails)
 * - User behavior analytics
 * - Debugging production issues
 * 
 * Both success and failure paths are logged to maintain complete audit trail.
 * 
 * @param req - User creation payload containing username, password, name, class, and role
 * @returns Promise<User> - Newly created user document with MongoDB _id
 * @throws Re-throws any database errors after logging them
 */
export const userCreate = async (req: PostUserCreate, adminId: string) => {
  try {
    // Insert user document into MongoDB collection
    const user = await User.insertOne(req);
    
    // Log successful user creation to audit trail
    // Captures: actor identity, resource affected, operation details
    logAudit({
      timestamp: new Date().toISOString(),
      action: 'USER_CREATE',
      actor: adminId,
      actorRole: 'admin',
      resource: 'user',
      resourceId: user._id?.toString(),
      details: { username: req.username, name: req.name, class: req.class, role: req.role },
      success: true
    });
    
    return user;
  } catch (err) {
    // Log failed creation attempt with error details
    // Critical for security monitoring (e.g., repeated failures may indicate attack)
    logAudit({
      timestamp: new Date().toISOString(),
      action: 'USER_CREATE',
      actor: adminId,
      actorRole: 'admin',
      resource: 'user',
      details: { username: req.username, name: req.name, error: (err as Error).message },
      success: false
    });
    throw err;
  }
};

export const userDeleteById = async (req: { id: string }, adminId: string) => {
  try {
    const user = await User.findById(req.id).lean();
    await User.findByIdAndDelete(req.id);
    
    logAudit({
      timestamp: new Date().toISOString(),
      action: 'USER_DELETE',
      actor: adminId,
      actorRole: 'admin',
      resource: 'user',
      resourceId: req.id,
      details: { username: user?.username, name: user?.name },
      success: true
    });
  } catch (err) {
    logAudit({
      timestamp: new Date().toISOString(),
      action: 'USER_DELETE',
      actor: adminId,
      actorRole: 'admin',
      resource: 'user',
      resourceId: req.id,
      details: { error: (err as Error).message },
      success: false
    });
    throw err;
  }
};

/**
 * Retrieves all users with dynamic filtering and pagination.
 * 
 * BUSINESS LOGIC FLOW:
 * 1. Calculate pagination offset based on page number (100 records per page)
 * 2. Build dynamic query object based on provided filters
 * 3. Execute MongoDB query with filters, pagination, and field selection
 * 4. Return array of matching user documents
 * 
 * PAGINATION STRATEGY:
 * - Fixed page size: 100 users per page
 * - Offset-based pagination: skip = (page - 1) * 100
 * - Page 1: records 0-99, Page 2: records 100-199, etc.
 * 
 * QUERY BUILDING LOGIC:
 * - role: Always required (defaults to 'voter')
 * - name: Case-insensitive partial match using sanitized regex
 * - class: Optional - only added to query if provided
 * - isVoted: Optional - only added to query if explicitly set (true/false)
 * 
 * SECURITY CONSIDERATIONS:
 * ⚠️ CRITICAL SECURITY ISSUE: Password field is exposed in response (line 102)
 * - Passwords should NEVER be returned in API responses, even if hashed
 * - Attackers can use exposed hashes for offline cracking attempts
 * - RECOMMENDATION: Remove 'password' from .select() projection
 * 
 * NoSQL INJECTION PREVENTION:
 * - sanitizeRegex() escapes special regex chars in name filter
 * - Prevents attackers from injecting regex patterns to:
 *   1. Enumerate all users with ".*"
 *   2. Perform reconnaissance with patterns like "^admin.*"
 *   3. Cause ReDoS attacks with complex nested patterns
 * 
 * @param req - Filter and pagination parameters (page, name, class, role, isVoted)
 * @returns Promise<User[]> - Array of user documents matching the query
 * @throws Re-throws any database query errors
 */
export const userGetAll = async (req: GetUser) => {
  try {
    // PAGINATION CALCULATION
    // Convert page number (1-indexed) to MongoDB skip offset (0-indexed)
    // Example: page 1 → skip 0, page 2 → skip 100, page 3 → skip 200
    const skip = (page: number) => {
      return --page * 100;
    };
    // Fixed page size for consistent pagination
    const limit = 100;

    // DYNAMIC QUERY CONSTRUCTION
    // Base query with required fields (name pattern only)
    const query: any = {
      // SECURITY: Sanitize name input to prevent NoSQL injection via regex
      name: {
        $regex: sanitizeRegex(req.name), // Escaped user input for safe regex matching
        $options: "i", // Case-insensitive search
      },
    };

    // CONDITIONAL FILTER: Add role only if explicitly provided and not empty
    // Empty string means "no role filter" (return all roles)
    if (req.role && req.role !== "") {
      query.role = req.role; // Filter by user role (voter, admin, etc.)
    }

    // CONDITIONAL FILTER: Add isVoted only if explicitly provided
    // Allows filtering for voted/unvoted users while defaulting to all users
    if (req.isVoted !== undefined && req.isVoted !== null) {
      query.isVoted = req.isVoted;
    }

    // CONDITIONAL FILTER: Add class only if provided and not empty
    // Empty string means "no class filter" (return all classes)
    // Enables filtering by student class (e.g., "10A", "11B") when needed
    if (req.class && req.class !== "") {
      query.class = req.class;
    }

    // EXECUTE QUERY with filters, pagination, and field projection
    const users = await User.find()
      .where(query) // Apply dynamic filters
      .select("name class username _id isVoted password role") // ⚠️ SECURITY ISSUE: password should NOT be selected
      .skip(skip(req.page)) // Pagination: Skip previous pages
      .limit(limit) // Pagination: Limit results per page
      .lean(); // Return plain JavaScript objects (not Mongoose documents) for better performance
    return users;
  } catch (err) {
    throw err;
  }
};

/**
 * Retrieves a single user by their MongoDB ObjectId.
 * 
 * BUSINESS LOGIC FLOW:
 * 1. Query MongoDB by _id field
 * 2. Return user document as plain JavaScript object (lean)
 * 3. Return null if user not found (Mongoose behavior)
 * 
 * USAGE CONTEXT:
 * Typically called for:
 * - User profile views
 * - Authentication verification
 * - Authorization checks
 * - User data updates (fetch before update)
 * 
 * SECURITY CONSIDERATION:
 * ⚠️ No field projection applied - returns ALL user fields including password
 * Calling code must sanitize response before sending to client
 * 
 * @param id - MongoDB ObjectId string of the user
 * @returns Promise<User | null> - User document or null if not found
 * @throws Database errors (invalid ObjectId format, connection issues)
 */
export const userGetById = async (id: string) => {
  try {
    // Fetch user by MongoDB _id, return as plain object for performance
    const user = await User.findById(id).lean();
    return user;
  } catch (err) {
    throw err;
  }
};

/**
 * Deletes a user by their MongoDB ObjectId with full audit logging.
 * 
 * BUSINESS LOGIC FLOW:
 * 1. Fetch user document to capture details before deletion (for audit trail)
 * 2. Execute hard delete using deleteOne with _id filter
 * 3. Log successful deletion with user metadata
 * 4. On failure, log error details for compliance and debugging
 * 
 * AUDIT LOGGING RATIONALE:
 * User deletion is a high-risk operation that requires comprehensive logging:
 * - Compliance: GDPR/data protection regulations require deletion audit trails
 * - Security: Detects unauthorized deletions or account takeover attempts
 * - Recovery: Provides metadata for potential account restoration requests
 * - Forensics: Critical evidence for security incident investigations
 * 
 * OPERATION TYPE:
 * Hard delete (permanent) - no soft delete/archival implemented
 * Consider implementing soft delete for production systems to enable:
 * - Account recovery within grace period
 * - Data retention compliance
 * - Referential integrity maintenance
 * 
 * @param id - MongoDB ObjectId string of the user to delete
 * @returns Promise<void> - No return value on success
 * @throws Re-throws any database errors after logging them
 */
export const deleteUserById = async (id: string, adminId: string) => {
  try {
    // Fetch user before deletion to capture metadata for audit trail
    // Uses lean() for performance since we only need data, not Mongoose document
    const user = await User.findById(id).lean();
    
    // Execute hard delete - permanently removes user document
    await User.deleteOne({
      _id: id,
    });
    
    // Log successful deletion with captured user metadata
    // Preserves username/name for audit trail even after document is deleted
    logAudit({
      timestamp: new Date().toISOString(),
      action: 'USER_DELETE',
      actor: adminId,
      actorRole: 'admin',
      resource: 'user',
      resourceId: id,
      details: { username: user?.username, name: user?.name },
      success: true
    });
  } catch (err) {
    // Log failed deletion attempt for security monitoring
    // Repeated failures may indicate:
    // - Authorization bypass attempts
    // - Application bugs
    // - Database connectivity issues
    logAudit({
      timestamp: new Date().toISOString(),
      action: 'USER_DELETE',
      actor: adminId,
      actorRole: 'admin',
      resource: 'user',
      resourceId: id,
      details: { error: (err as Error).message },
      success: false
    });
    throw err;
  }
};
