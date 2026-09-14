import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { getCandidate } from "../controllers/candidate.controller";
import { rateLimitMiddleware } from "../middlewares/rate-limit.middleware";

/**
 * Candidate Routes
 * 
 * Base Path: /api/candidates (configured in main app)
 * 
 * Purpose:
 * Manages candidate retrieval for authenticated voters.
 * Candidates are the nominees that voters can choose from.
 * 
 * Route Protection Strategy:
 * - All routes require authentication (router-level middleware)
 * - No public candidate access (prevents scraping and unauthorized data access)
 * - Individual endpoints can add additional authorization if needed
 * 
 * Why Authentication Required:
 * - Prevents unauthorized access to candidate data
 * - Ensures only registered voters can view candidates
 * - Enables tracking of who viewed candidate information
 * - Protects against automated scraping and data harvesting
 */
const router = Router()

/**
 * Global Authentication Middleware
 * 
 * Applied to ALL routes in this router using router.use()
 * 
 * Execution Order:
 * 1. Request enters router
 * 2. authMiddleware validates JWT token
 * 3. If valid: attaches user to req.user, proceeds to route handler
 * 4. If invalid: returns 401 Unauthorized, stops request chain
 * 
 * Protected By:
 * - JWT token validation
 * - Token expiration check
 * - User existence verification
 * 
 * This pattern ensures we don't accidentally expose candidate data
 * on any new routes added to this router.
 */
router.use(authMiddleware)

/**
 * GET /api/candidates
 * 
 * Retrieves list of all candidates available for voting
 * 
 * Middleware Chain:
 * 1. authMiddleware (applied via router.use above)
 * 2. getCandidate controller handler
 * 
 * Access Control:
 * - Requires valid JWT token (enforced by router-level auth)
 * - Available to all authenticated voters
 * - No additional role restrictions
 * 
 * Response:
 * - Returns array of candidate objects with names, photos, descriptions
 * - May include vote counts (depends on controller implementation)
 * 
 * Use Cases:
 * - Display candidate list on voting page
 * - Show candidate details before vote submission
 * - Candidate search and filtering (if implemented)
 * 
 * Rate Limiting:
 * - rateLimitMiddleware imported but not applied
 * - Consider adding for production: router.get("/", rateLimitMiddleware, getCandidate)
 * - Prevents excessive polling and API abuse
 */
router.get("/", getCandidate)

export default router