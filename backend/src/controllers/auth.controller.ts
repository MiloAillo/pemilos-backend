/**
 * AUTHENTICATION CONTROLLERS
 * 
 * Handles authentication HTTP requests and orchestrates JWT token lifecycle.
 * 
 * CONTROLLERS:
 * - login: Authenticates user credentials and issues JWT token
 * - checkProfile: Returns current authenticated user info from JWT
 * - isUser: Validates if current user has voter role
 * - isAdmin: Validates if current user has admin role
 * 
 * JWT TOKEN LIFECYCLE:
 * 1. User submits credentials → login controller
 * 2. Credentials validated → JWT generated with user ID and role
 * 3. JWT returned to client with expiration time
 * 4. Client stores JWT and sends in Authorization header for protected requests
 * 5. authMiddleware validates JWT on each protected request
 * 6. Token expires after configured duration, requiring re-authentication
 * 
 * SECURITY:
 * - Tokens have role-based expiration (5min voters, 24h admins)
 * - User ID and role embedded in token (tamper-proof via signature)
 * - Audit logging tracks all authentication attempts
 */

import { TokenClass } from "typescript";
import { PostAuthLogin } from "../dtos/auth.dto";
import { createError } from "../exceptions/error.exception";
import { asyncHandler } from "../middlewares/async_handler.middleware";
import { authLogin } from "../services/auth.service";
import { generateToken, getPayload } from "../utils/jwt.util";
import { logger } from "../utils/logger.util";

/**
 * Cookie name for storing JWT token (currently unused, tokens returned in response body)
 */
const cookieName = "pemilostoken";

/**
 * LOGIN CONTROLLER
 * 
 * Authenticates user credentials and generates JWT token.
 * 
 * REQUEST FLOW:
 * POST /auth/login
 * Body: { username: string, password: string }
 * → validateDTO (schema validation)
 * → login controller (this function)
 * → authLogin service (credential validation)
 * → JWT token generation
 * → Response: { status: "success", token: "<JWT_TOKEN>" }
 * 
 * JWT TOKEN GENERATION:
 * - Voter tokens: 5 minutes expiration (300 seconds)
 * - Admin tokens: 24 hours expiration (86400 seconds)
 * 
 * SECURITY:
 * - Short voter token expiration minimizes risk window during voting session
 * - Longer admin token expiration balances security with usability for admin tasks
 * - Token contains user ID and role, cryptographically signed
 * - Audit logs track all login attempts (success and failure)
 */
export const login = asyncHandler(async (req, res) => {
  /**
   * STEP 1: Extract credentials from request body
   * 
   * Body already validated by validateDTO(postAuthLogin) middleware
   * Schema ensures username and password are present and valid format
   */
  const { username, password } = req.body;

  /**
   * STEP 2: Authenticate user credentials
   * 
   * authLogin service performs:
   * - User lookup by username
   * - Password verification (plaintext comparison - consider hashing)
   * - Vote status check (prevents re-voting)
   * - Audit logging
   * 
   * Throws error if authentication fails (user not found, wrong password, already voted)
   */
  const user = await authLogin({
    username,
    password,
  } as PostAuthLogin);

  /**
   * STEP 3: Determine token expiration based on user role
   * 
   * SECURITY: Role-based token expiration balances security and usability
   * 
   * Default: 5 minutes (300,000 ms) for voters
   * - Short expiration limits exposure if token stolen
   * - Voters only need access during brief voting session
   */
  let cookieAge = 5 * 60 * 1000;

  /**
   * Admin role: 24 hours (86,400,000 ms)
   * - Longer session for administrative tasks
   * - Still expires to enforce periodic re-authentication
   */
  if (user.role == "admin") {
    cookieAge = 24 * 60 * 60 * 1000;
  }

  /**
   * STEP 4: Generate JWT token
   * 
   * Token payload contains:
   * - id: User MongoDB ObjectId (for database queries)
   * - role: "voter" or "admin" (for authorization checks)
   * 
   * Token is signed with JWT_SECRET from environment
   * Token expires after cookieAge seconds (divide by 1000 to convert ms to seconds)
   * 
   * SECURITY: Token signature prevents tampering with payload
   * - Changing role or ID invalidates signature
   * - Only server with JWT_SECRET can generate valid tokens
   */
  const token = generateToken(user._id.toString(), user.role, cookieAge / 1000);

  /**
   * STEP 5: Return JWT token to client
   * 
   * Client should:
   * - Store token securely (memory, sessionStorage, or localStorage)
   * - Send token in Authorization header for protected requests
   * - Handle token expiration (401 errors) by prompting re-login
   * 
   * Response format: { status: "success", token: "<JWT_TOKEN>" }
   */
  res.status(200).json({
    status: "sucess",
    token: token,
  });

  return;
});

/**
 * IS USER CONTROLLER
 * 
 * Validates that current authenticated user has "voter" role.
 * 
 * REQUEST FLOW:
 * Requires authMiddleware before this controller
 * Token already validated, payload contains { id, role }
 * 
 * SECURITY: Role-based access control (RBAC)
 * Used to protect voter-only routes
 */
export const isUser = asyncHandler(async (req, res) => {
  /**
   * Extract role from JWT payload
   * Token was validated by authMiddleware, so payload is trusted
   */
  const { role } = getPayload(req);

  /**
   * Enforce voter role requirement
   * Admins attempting to access voter-specific routes are rejected
   */
  if (role != "voter") {
    throw createError("Unauthorized", "unauthorized, you're not user", 401);
  }

  res.status(200).json({
    status: "success",
  });
});

/**
 * IS ADMIN CONTROLLER
 * 
 * Validates that current authenticated user has "admin" role.
 * 
 * REQUEST FLOW:
 * Requires authMiddleware before this controller
 * 
 * SECURITY: Role-based access control (RBAC)
 * Used to protect admin-only routes (can also use adminMiddleware)
 */
export const isAdmin = asyncHandler(async (req, res) => {
  /**
   * Extract role from JWT payload
   */
  const { role } = getPayload(req);

  /**
   * Enforce admin role requirement
   * Voters attempting to access admin routes are rejected
   */
  if (role != "admin") {
    throw createError("Unauthorized", "unauthorized, you're not admin", 401);
  }

  res.status(200).json({
    status: "success",
  });
});

/**
 * CHECK PROFILE CONTROLLER
 * 
 * Returns current authenticated user's profile from JWT token.
 * 
 * REQUEST FLOW:
 * GET /auth/me
 * Authorization header: <JWT_TOKEN>
 * → authMiddleware (validates token)
 * → checkProfile (this function)
 * → Response: { status: "success", data: { role, id } }
 * 
 * USE CASE:
 * Frontend can call this endpoint to:
 * - Verify token is still valid
 * - Get current user role for UI rendering
 * - Get user ID for API calls
 * 
 * SECURITY:
 * - No database query needed (info from JWT token)
 * - Token already validated by authMiddleware
 * - Returns only non-sensitive user info (role and ID)
 */
export const checkProfile = asyncHandler(async (req, res) => {
  /**
   * Extract user info from JWT payload
   * 
   * Payload contains:
   * - id: User MongoDB ObjectId string
   * - role: "voter" or "admin"
   * 
   * This data was embedded during login and verified by authMiddleware
   */
  const { role, id } = getPayload(req);

  /**
   * Return user profile data
   * 
   * Frontend can use this to:
   * - Display user role in UI
   * - Make role-based UI decisions (show/hide admin features)
   * - Confirm authentication status
   */
  res.status(200).json({
    status: "success",
    message: "successlly get the profile",
    data: {
      role,
      id,
    },
  });

  return;
});
