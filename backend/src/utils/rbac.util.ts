/**
 * Role-Based Access Control (RBAC) Utility
 * 
 * PURPOSE:
 * Enforces role-based permissions across API endpoints by validating JWT token roles
 * against required role lists. Provides centralized authorization logic to prevent
 * unauthorized access to protected resources.
 * 
 * SECURITY MODEL:
 * - Authentication: Handled by JWT validation (jwt.util.ts)
 * - Authorization: Handled by this utility (role checking)
 * - Principle of least privilege: Endpoints specify minimum required roles
 * 
 * WHEN TO USE:
 * - Protect admin-only endpoints (user management, system config)
 * - Restrict voting operations to voter role
 * - Limit candidate registration to candidate role
 * - Any endpoint requiring role-based access control
 * 
 * INTEGRATION WITH MIDDLEWARE:
 * Typically used inside route handlers after authentication middleware:
 * 
 * @example
 *   router.post('/admin/users', authenticateJWT, async (req, res) => {
 *     requireRole(req, ['admin']);  // Throws 403 if not admin
 *     // ... admin-only logic
 *   });
 * 
 * SECURITY IMPLICATIONS:
 * - Always call AFTER JWT authentication (requires valid token)
 * - Denies access by throwing exception (fail-secure design)
 * - Returns 403 Forbidden (not 401) to distinguish from authentication failures
 * - Logs should capture authorization failures for security monitoring
 * 
 * ROLE HIERARCHY:
 * Current implementation uses flat role checking (no inheritance).
 * If adding role hierarchy (e.g., admin inherits all roles), implement here.
 * 
 * AUDIT CONSIDERATIONS:
 * - Authorization failures should be logged to audit.util.ts
 * - Track patterns of unauthorized access attempts (potential attacks)
 * - Consider rate limiting on authorization failures
 */

import { Request } from 'express';
import { getPayload } from './jwt.util';
import { createError } from '../exceptions/error.exception';

/**
 * Enforce role-based access control on protected endpoints
 * 
 * BEHAVIOR:
 * 1. Extracts JWT payload from request (validated by prior auth middleware)
 * 2. Checks if user's role matches any of the allowed roles
 * 3. Throws 403 Forbidden if role not authorized
 * 4. Returns payload if authorized (for use in handler)
 * 
 * FAIL-SECURE DESIGN:
 * - Denies access by default if role not in allowedRoles
 * - Throws exception rather than returning boolean (prevents accidental bypass)
 * - Uses strict equality checking (no fuzzy matching)
 * 
 * USAGE PATTERNS:
 * 
 * Single Role:
 *   requireRole(req, ['admin']);
 * 
 * Multiple Roles (OR logic):
 *   requireRole(req, ['admin', 'moderator']);
 * 
 * With Payload Usage:
 *   const payload = requireRole(req, ['voter']);
 *   const voterId = payload.userId;
 * 
 * @param req - Express request object (must contain valid JWT from auth middleware)
 * @param allowedRoles - Array of role strings that are permitted access
 * @returns JWT payload if authorized (contains userId, role, etc.)
 * @throws 403 Forbidden if user's role not in allowedRoles
 * @throws 401 Unauthorized if JWT invalid or missing (from getPayload)
 * 
 * @example
 *   // Protect admin endpoint
 *   export const deleteUser = async (req: Request, res: Response) => {
 *     requireRole(req, ['admin']);
 *     const userId = req.params.id;
 *     await UserService.delete(userId);
 *     res.status(204).send();
 *   };
 * 
 * @example
 *   // Allow multiple roles
 *   export const viewReports = async (req: Request, res: Response) => {
 *     const payload = requireRole(req, ['admin', 'auditor']);
 *     const reports = await ReportService.getAll();
 *     res.json(reports);
 *   };
 * 
 * SECURITY NOTES:
 * - Role names are case-sensitive (ensure consistency across system)
 * - JWT must be validated before this check (use authenticateJWT middleware)
 * - Consider adding permission-based checks for finer-grained control
 * - Log authorization failures for security monitoring and compliance
 * 
 * FUTURE ENHANCEMENTS:
 * - Add permission-based checks (e.g., 'can_delete_users')
 * - Implement role hierarchy (admin inherits all lower roles)
 * - Add resource-based checks (e.g., user can only edit own profile)
 * - Support dynamic role loading from database
 */
export const requireRole = (req: Request, allowedRoles: string[]) => {
  // Extract and validate JWT payload from request
  // This will throw 401 if token is invalid or missing
  const payload = getPayload(req);
  
  // Check if user's role is in the allowed roles list
  // Uses strict string matching (case-sensitive)
  if (!allowedRoles.includes(payload.role)) {
    // Return 403 Forbidden (not 401) to indicate authorization failure
    // 401 = authentication failure (invalid/missing token)
    // 403 = authorization failure (valid token, insufficient permissions)
    throw createError(
      "forbidden",
      `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      403
    );
  }
  
  // Return payload for use in handler (contains userId, role, iat, exp, etc.)
  return payload;
};
