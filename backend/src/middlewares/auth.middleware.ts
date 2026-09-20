/**
 * AUTHENTICATION MIDDLEWARE
 * 
 * Validates JWT tokens on protected routes to ensure only authenticated users can access resources.
 * 
 * REQUEST FLOW:
 * 1. Extract JWT token from Authorization header (case-insensitive)
 * 2. Validate token exists
 * 3. Verify token signature, expiration, and structure
 * 4. Attach decoded payload to request for downstream use
 * 5. Pass control to next middleware/controller
 * 
 * SECURITY:
 * - Case-insensitive header check prevents bypassing via lowercase "authorization"
 * - Token verification checks signature (prevents tampering) and expiration (limits exposure)
 * - Missing or invalid tokens immediately reject request with 401 Unauthorized
 * - Token payload contains user ID and role for authorization decisions
 * 
 * JWT TOKEN LIFECYCLE:
 * - Generated at login with expiration time (5min for voters, 24h for admins)
 * - Stored client-side (localStorage, sessionStorage, or memory)
 * - Sent with every protected request in Authorization header
 * - Validated here before allowing access to protected resources
 * - Expires automatically, requiring re-authentication
 */

import { NextFunction, Request, Response } from 'express';
import { verifyToken, getPayload } from "../utils/jwt.util";
import {createError} from "../exceptions/error.exception";
import { MiddlewareHandler } from '../utils/types.util';
import { logger } from '../utils/logger.util';
import jwt from "jsonwebtoken";
import { authenticatedUsersGauge } from './metrics.middleware';
import { getRedisClient } from '../configs/redis.config';

export const authMiddleware: MiddlewareHandler = async (req, res, next) => {
    /**
     * STEP 1: Extract JWT token from Authorization header
     * 
     * SECURITY: Case-insensitive check prevents bypassing authentication
     * by sending lowercase "authorization" header instead of "Authorization"
     * 
     * Expected header format: "Authorization: <JWT_TOKEN>"
     * Note: No "Bearer" prefix expected in this implementation
     */
    const token: string | undefined = req.get("Authorization") || req.get("authorization")

    /**
     * STEP 2: Validate token presence
     * 
     * If no token provided, user is not authenticated
     * Return 401 Unauthorized with clear error message
     */
    if (!token) {
        throw createError(
            "unauthorized",
            "token required, you're not logged in",
            401
        );
    }

    /**
     * STEP 3: Verify token validity
     * 
     * verifyToken checks:
     * - Signature matches (token not tampered with)
     * - Token not expired (still within valid time window)
     * - Token structure is valid JWT format
     * 
     * SECURITY: Token expiration limits exposure window if token is stolen
     * - Voter tokens expire in 5 minutes (short session for voting security)
     * - Admin tokens expire in 24 hours (longer for administrative tasks)
     */
    if(!verifyToken(token)) {
        throw createError(
            "unauthorized",
            "invalid Token",
            401
        )
    }

    /**
     * STEP 4: Track active user for metrics
     * 
     * Uses Redis sorted set to track unique active users in 5-minute window
     * - Key: "metrics:active_users"
     * - Score: Current timestamp
     * - Value: User ID
     * - Expiration: Clean up entries older than 5 minutes
     */
    try {
        const payload = getPayload(req);
        if (payload && payload.id) {
            const redisClient = getRedisClient();
            const now = Date.now();
            const fiveMinutesAgo = now - (5 * 60 * 1000);
            
            // Add current user with timestamp as score
            await redisClient.zadd('metrics:active_users', now, payload.id);
            
            // Remove users inactive for >5 minutes
            await redisClient.zremrangebyscore('metrics:active_users', 0, fiveMinutesAgo);
            
            // Count unique active users and update gauge
            const activeCount = await redisClient.zcard('metrics:active_users');
            authenticatedUsersGauge.set(activeCount);
        }
    } catch (err) {
        // Don't fail request if metrics tracking fails
        logger.warn({ err }, 'Failed to update active users metric');
    }

    /**
     * STEP 5: Token validated, proceed to next middleware/controller
     * 
     * Downstream handlers can extract user info from token using getPayload(req)
     * Payload contains: { id: string, role: "voter" | "admin" }
     */
    next()
}