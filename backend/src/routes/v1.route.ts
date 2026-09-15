import { Router } from "express";
import adminRoute from "./admin.route";
import authRoute from "./auth.routes";
import candidateRoute from "./candidate.route";
import voteRoute from "./vote.route";
import { rateLimitMiddleware } from "../middlewares/rate-limit.middleware";

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
// ⚠️ SECURITY: Apply rate limiting to ALL v1 routes as the first middleware.
// This provides defense-in-depth even if individual route files forget to add
// rate limiting. Individual routes can apply stricter limits on top of this
// baseline protection (e.g., lower limits for /auth/login to prevent brute-force).
router.use(rateLimitMiddleware);

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
