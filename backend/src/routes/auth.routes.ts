/**
 * AUTH ROUTES
 * 
 * Defines authentication endpoints and applies middleware chain for security.
 * 
 * REQUEST FLOW:
 * 1. POST /auth/login → validateDTO → login controller → returns JWT token
 * 2. GET /auth/me → authMiddleware (validates JWT) → checkProfile controller
 * 
 * SECURITY:
 * - Login endpoint validates input schema before processing
 * - All routes after authMiddleware require valid JWT token
 * - Token must be present in Authorization header
 * - Rate limiting can be applied to prevent brute force attacks
 */

import { Router } from "express"
import { validateDTO } from "../middlewares/validate.middleware"
import { postAuthLogin } from "../dtos/auth.dto"
import { checkProfile, login } from "../controllers/auth.controller"
import { authMiddleware } from "../middlewares/auth.middleware"
import { rateLimitMiddleware } from "../middlewares/rate-limit.middleware"

const router = Router()

/**
 * PUBLIC ROUTE: Login endpoint
 * 
 * REQUEST FLOW:
 * Client → validateDTO (schema validation) → login controller → JWT generation → response
 * 
 * Expected body: { username: string, password: string }
 * Returns: { status: "success", token: "<JWT_TOKEN>" }
 */
router.post("/login", validateDTO(postAuthLogin), login)

/**
 * PROTECTED ROUTES: All routes below require authentication
 * 
 * authMiddleware extracts and verifies JWT token from Authorization header
 * Requests without valid token receive 401 Unauthorized
 */
router.use(authMiddleware)

/**
 * GET /me - Check current user profile
 * 
 * REQUEST FLOW:
 * Client (with Authorization header) → authMiddleware (token validation) → checkProfile
 * 
 * Returns: { status: "success", data: { role: string, id: string } }
 */
router.get("/me", checkProfile)

export default router