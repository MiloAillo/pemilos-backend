import { Router } from "express";
import adminRoute from "./admin.route";
import authRoute from "./auth.routes";
import candidateRoute from "./candidate.route";
import voteRoute from "./vote.route";

// =============================================================================
// V1 API ROUTER
// =============================================================================
// Central routing hub for all /api/v1/* endpoints. This router aggregates
// domain-specific route modules and applies shared middleware to the entire
// v1 API surface. Versioning at this level allows future v2 routes to coexist
// with v1 without breaking existing clients.
const router = Router();

// =============================================================================
// RATE LIMITING
// =============================================================================
// ⚠️ SECURITY: Global rate limiting applied in index.ts covers all v1 routes.
// Individual routes can apply stricter limits on top of the baseline protection
// if needed (e.g., lower limits for /auth/login to prevent brute-force attacks).
// The global middleware provides defense-in-depth without double-counting requests.

// =============================================================================
// ROUTE MODULES
// =============================================================================
// Admin operations - user management, system configuration, audit logs
// Should include role-based authorization middleware within admin.route.ts
router.use("/admin", adminRoute);

// Authentication and authorization - login, register, token refresh, logout
// Public endpoints with strict rate limiting to prevent credential stuffing
router.use("/auth", authRoute);

// Voting operations - cast vote, retrieve voting status, vote verification
// Requires authentication middleware in vote.route.ts to ensure voter identity
router.use("/vote", voteRoute);

// Candidate operations - list candidates, get candidate details, search
// Mix of public (list, view) and protected (create, update) endpoints
router.use("/candidate", candidateRoute);

export default router;
