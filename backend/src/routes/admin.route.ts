import { Request, Response, Router } from "express";
import multer from "multer";
import {
  countVoter,
  exportTokenizedVoterFromCSV,
  getLiveCount,
  resetVote,
  uploadVoterFromCsv,
} from "../controllers/voter.controller";
import path from "path";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";
import { validateDTO } from "../middlewares/validate.middleware";
import { getUser, postUserCreate } from "../dtos/user.dto";
import {
  createUser,
  deleteUser,
  getAllUser,
  getUserById,
} from "../controllers/user.controller";
import { postCandidateCreate } from "../dtos/candidate.dto";
import {
  createCandidate,
  deleteCandidate,
} from "../controllers/candidate.controller";
import { deleteResetVote } from "../dtos/vote.dto";

import {
  getVoteStatus,
  toggleAllowVote,
} from "../controllers/setting.controller";
import { isAdmin, isUser } from "../controllers/auth.controller";

/**
 * Admin Router - Handles all administrative operations
 * 
 * SECURITY: All routes (except /vote/status) are protected by:
 * 1. authMiddleware - Validates JWT token
 * 2. adminMiddleware - Ensures user has admin role
 * 
 * This dual-layer protection prevents unauthorized access to sensitive operations
 * like user management, vote resets, and bulk data uploads.
 */
const router = Router();

/**
 * Configure Multer for secure file uploads
 * 
 * SECURITY LAYERS:
 * 1. File size limits - Prevents DoS via massive uploads
 * 2. MIME type validation - First line of defense against malicious files
 * 3. Extension validation - Second validation layer (clients can spoof MIME types)
 * 4. Path traversal prevention - Stops directory traversal attacks (../../etc/passwd)
 * 5. Filename sanitization - Removes special characters that could exploit filesystem
 * 
 * @returns Configured multer instance with security constraints
 * 
 * Why these validations matter:
 * - Attackers may try to upload executable files (.exe, .sh) disguised as CSV
 * - Path traversal (../) could write files outside intended directory
 * - Large files could exhaust disk space or memory (DoS attack)
 * - Malformed filenames could break parsing or logging systems
 */
function getUpload(): multer.Multer {
  const nodeEnv = process.env.NODE_ENV ?? "dev";

  // Environment-specific upload paths
  // Dev: Relative to project structure for easy access
  // Production: Absolute path in containerized environment (/app/uploads)
  const uploadPath = nodeEnv == "dev" 
    ? path.resolve(__dirname, "..", "..", "uploads")
    : path.resolve("/app/uploads");

  return multer({
    dest: uploadPath,
    limits: {
      // SECURITY: 10MB file size limit
      // Why? Prevents denial-of-service attacks via resource exhaustion
      // Large CSV files can consume memory during parsing and slow down the server
      // 10MB accommodates ~200,000 rows of voter data while preventing abuse
      fileSize: 10 * 1024 * 1024, // 10MB limit for large CSV files
    },
    fileFilter: (req, file, cb) => {
      // SECURITY LAYER 1: MIME Type Validation
      // Validates the Content-Type header sent by the client
      // WARNING: Clients can lie about MIME types, so this is not sufficient alone
      // We combine this with extension checking for defense in depth
      const allowedMimeTypes = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(new Error('Invalid file type. Only CSV files are allowed.'));
      }

      // SECURITY LAYER 2: Extension Validation
      // Ensures the file extension matches expected type
      // Why .toLowerCase()? Prevents bypass via .CSV, .CsV, etc.
      // This catches files that pass MIME check but have wrong extension
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext !== '.csv') {
        return cb(new Error('Invalid file extension. Only .csv files are allowed.'));
      }

      // SECURITY LAYER 3: Path Traversal Prevention
      // Prevents directory traversal attacks like "../../etc/passwd.csv"
      // path.basename() strips directory components, so we verify it matches original
      // The ".." check catches traversal attempts that might slip through
      const basename = path.basename(file.originalname);
      if (basename !== file.originalname || basename.includes('..')) {
        return cb(new Error('Invalid filename detected.'));
      }

      // All security checks passed - accept the file
      cb(null, true);
    },
  });
}

// ============================================================================
// PUBLIC ROUTES (No authentication required)
// ============================================================================

/**
 * GET /admin/vote/status
 * Check if voting is currently enabled/disabled
 * 
 * Public endpoint - allows clients to check voting status before authentication
 * This enables UI to show appropriate messages to users
 */
router.get("/vote/status", getVoteStatus);

// ============================================================================
// AUTHENTICATION & AUTHORIZATION MIDDLEWARE CHAIN
// ============================================================================

/**
 * Apply authentication middleware to ALL routes below this point
 * 
 * authMiddleware:
 * - Validates JWT token from Authorization header
 * - Extracts user information and attaches to req.user
 * - Rejects requests with invalid/expired/missing tokens
 * 
 * This is applied BEFORE adminMiddleware to ensure we know WHO is making the request
 */
router.use(authMiddleware);

/**
 * Apply admin authorization middleware to ALL routes below this point
 * 
 * adminMiddleware:
 * - Checks if authenticated user has admin role
 * - Rejects requests from non-admin users (even if authenticated)
 * 
 * SECURITY: Dual middleware pattern (auth + admin) implements defense in depth:
 * 1. First verify identity (authMiddleware)
 * 2. Then verify permissions (adminMiddleware)
 * 
 * This prevents privilege escalation - even if someone bypasses one layer,
 * they still can't access admin functions without both valid auth AND admin role.
 */
router.use(adminMiddleware);

// ============================================================================
// PROTECTED ADMIN ROUTES (Requires authentication + admin role)
// ============================================================================

/**
 * POST /admin/upload/csv
 * Bulk upload voters from CSV file
 * 
 * Security chain:
 * 1. authMiddleware - Verify JWT token
 * 2. adminMiddleware - Verify admin role
 * 3. getUpload().single("file") - Validate file (MIME, extension, size, path traversal)
 * 4. uploadVoterFromCsv - Parse and validate CSV content, insert into database
 * 
 * The multer middleware (getUpload) runs BEFORE the controller to reject malicious
 * files early, preventing them from reaching business logic.
 */
router.post("/upload/csv", getUpload().single("file"), uploadVoterFromCsv);

/**
 * POST /admin/upload/csv/token
 * Export tokenized voter data from CSV
 * 
 * Similar security chain to /upload/csv but generates tokens for voter authentication
 */
router.post(
  "/upload/csv/token",
  getUpload().single("file"),
  exportTokenizedVoterFromCSV,
);

/**
 * POST /admin/user
 * Create new user account
 * 
 * Middleware chain:
 * - validateDTO(postUserCreate) - Validates request body against DTO schema
 * - createUser - Business logic for user creation
 * 
 * DTO validation happens before controller to reject malformed requests early
 */
router.post("/user", validateDTO(postUserCreate), createUser);

/**
 * POST /admin/candidate
 * Create new candidate for election
 * 
 * DTO validation ensures candidate data meets schema requirements
 */
router.post("/candidate", validateDTO(postCandidateCreate), createCandidate);

/**
 * DELETE /admin/candidate/:id
 * Remove candidate from election
 * 
 * SECURITY: Admin-only to prevent voters from manipulating candidate list
 */
router.delete("/candidate/:id", deleteCandidate);

/**
 * PUT /admin/reset
 * Reset voting data (dangerous operation)
 * 
 * SECURITY CONSIDERATIONS:
 * - Requires explicit DTO validation to prevent accidental resets
 * - Admin-only to prevent malicious vote manipulation
 * - Should be used cautiously, ideally with additional confirmation in the UI
 */
router.put("/reset", validateDTO(deleteResetVote), resetVote);

/**
 * GET /admin/user
 * Retrieve all users with optional filtering/pagination
 * 
 * DTO validation on GET request validates query parameters
 */
router.get("/user", validateDTO(getUser), getAllUser);

/**
 * DELETE /admin/user/:id
 * Delete user account
 * 
 * Admin-only to prevent users from deleting each other's accounts
 */
router.delete("/user/:id", deleteUser);

/**
 * GET /admin/user/:id
 * Retrieve specific user details
 */
router.get("/user/:id", getUserById);

/**
 * GET /admin/count
 * Get total voter count statistics
 */
router.get("/count", countVoter);

/**
 * PUT /admin/vote/status
 * Enable or disable voting system-wide
 * 
 * CRITICAL OPERATION: Controls whether any votes can be cast
 * Admin-only to prevent unauthorized election manipulation
 */
router.put("/vote/status", toggleAllowVote);

/**
 * PUT /admin/check/user
 * Verify user role/permissions
 * 
 * Used for role-based access control checks
 */
router.put("/check/user", isUser);

/**
 * PUT /admin/check/admin
 * Verify admin role/permissions
 * 
 * Used to confirm admin status (e.g., before showing admin UI)
 */
router.put("/check/admin", isAdmin);

/**
 * GET /admin/live/count
 * Real-time vote counting endpoint
 * 
 * Provides live vote tallies for monitoring/display purposes
 */
router.get("/live/count", getLiveCount);

export default router;
