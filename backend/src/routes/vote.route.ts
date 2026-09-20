import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { vote } from "../controllers/voter.controller";
import { rateLimitMiddleware } from "../middlewares/rate-limit.middleware";
import { validateDTO } from "../middlewares/validate.middleware";
import { postInsertVote } from "../dtos/vote.dto";

/**
 * Vote Routes
 * 
 * Base Path: /api/vote (configured in main app)
 * 
 * Purpose:
 * Handles vote submission for authenticated voters.
 * This is the most critical endpoint in the voting system.
 * 
 * Route Protection Strategy:
 * - All routes require authentication (router-level middleware)
 * - Vote submission requires valid user identity
 * - Additional business logic validation in controller (one vote per user, voting period, etc.)
 * 
 * Security Considerations:
 * - Must prevent duplicate votes (enforced by database constraint and controller logic)
 * - Must validate voting period is active (checked in controller or middleware)
 * - Must prevent vote tampering (JWT validation ensures user identity)
 * - Should implement rate limiting to prevent spam (rateLimitMiddleware available but not applied)
 * 
 * Why Authentication Critical:
 * - Links vote to specific user for duplicate prevention
 * - Ensures only authorized voters can participate
 * - Enables audit trail (who voted when, without revealing choice)
 * - Prevents anonymous vote flooding
 */
const router = Router()

/**
 * Global Authentication Middleware
 * 
 * Applied to ALL routes in this router using router.use()
 * 
 * Execution Order:
 * 1. Request enters router
 * 2. authMiddleware validates JWT token from Authorization header
 * 3. If valid: extracts user ID, attaches to req.user, proceeds
 * 4. If invalid: returns 401 Unauthorized, halts request
 * 
 * Token Validation:
 * - Verifies JWT signature using secret key
 * - Checks token expiration timestamp
 * - Looks up user in database to ensure still exists
 * - Rejects tokens of deleted or suspended users
 * 
 * This router-level protection ensures no route can accidentally
 * allow unauthenticated vote submission.
 */
router.use(authMiddleware)

/**
 * POST /api/vote
 * 
 * Submits a vote for a candidate
 * 
 * Middleware Chain:
 * 1. authMiddleware (applied via router.use above)
 * 2. validateDTO(postInsertVote) - Validates request body (osis and mpk ObjectIDs)
 * 3. vote controller handler
 * 
 * Request Body:
 * {
 *   osis: string (24-char hex ObjectID of OSIS candidate)
 *   mpk: string (24-char hex ObjectID of MPK candidate)
 * }
 * 
 * Access Control:
 * - Requires valid JWT token (enforced by router-level auth)
 * - User must not have voted already (enforced in controller)
 * - Voting must be enabled (checked in controller)
 * 
 * Flow:
 * 1. Auth middleware validates JWT and loads user
 * 2. validateDTO ensures osis and mpk are valid ObjectIDs (24-char hex)
 * 3. Controller checks voting status (is voting period active?)
 * 4. Controller checks duplicate vote (has this user voted?)
 * 5. Controller records vote in database
 * 6. Returns success response (without revealing vote count for privacy)
 * 
 * Error Scenarios:
 * - 401: Invalid or missing JWT token
 * - 400: Missing or invalid candidate_id (osis/mpk not valid ObjectIDs)
 * - 403: User has already voted
 * - 403: Voting period is closed
 * - 404: Candidate does not exist
 * - 500: Database error
 * 
 * Rate Limiting Consideration:
 * - rateLimitMiddleware imported but not currently applied
 * - SHOULD BE ADDED: router.post("/", rateLimitMiddleware, validateDTO(postInsertVote), vote)
 * - Prevents brute force attacks trying different candidate IDs
 * - Limits repeated vote attempts after first successful submission
 * 
 * Security Notes:
 * - Vote content (candidate choice) should be stored securely
 * - Consider separating voter identity from vote choice for anonymity
 * - Implement idempotency to handle duplicate requests safely
 * - Log vote attempts for audit purposes (without exposing vote content)
 */
router.post("/", validateDTO(postInsertVote), vote)

export default router