/**
 * ADMIN AUTHORIZATION MIDDLEWARE
 * 
 * Enforces role-based access control (RBAC) for admin-only routes.
 * Must be chained AFTER authMiddleware (which validates the JWT token).
 * 
 * REQUEST FLOW:
 * authMiddleware (validates token) → adminMiddleware (checks role) → protected controller
 * 
 * SECURITY:
 * - Implements principle of least privilege: only admin role can access admin routes
 * - Role is embedded in JWT token during login (tamper-proof via signature)
 * - Prevents privilege escalation: voters cannot access admin endpoints
 * 
 * ROLE-BASED ACCESS CONTROL:
 * - "voter": Regular users who can cast votes
 * - "admin": Administrators who can manage candidates and view results
 */

import { createError } from "../exceptions/error.exception";
import { getPayload } from "../utils/jwt.util";
import { MiddlewareHandler } from "../utils/types.util";

export const adminMiddleware: MiddlewareHandler = async (req, res, next) => {
  /**
   * STEP 1: Extract JWT payload from request
   * 
   * getPayload decodes the JWT token from Authorization header
   * Token was already validated by authMiddleware, so we know it's valid
   * 
   * Payload structure: { id: string, role: "voter" | "admin" }
   * 
   * SECURITY: Role is cryptographically signed in JWT, cannot be tampered with
   */
  const payload = getPayload(req);

  /**
   * STEP 2: Check if user has admin role
   * 
   * SECURITY: Role-based access control (RBAC)
   * - Only users with role="admin" can proceed
   * - Voters attempting to access admin routes get 401 Unauthorized
   * 
   * WHY 401 NOT 403:
   * - 401 Unauthorized: You are not authenticated as an admin
   * - 403 Forbidden: You are authenticated but lack permission (alternative interpretation)
   */
  if (payload.role !== "admin") {
    throw createError("unauthorized", "you're not an admin", 401);
  }

  /**
   * STEP 3: User is admin, proceed to protected admin controller
   */
  next();
};
