import {AppError, isAppError} from "./error.exception";
import {Request, Response, NextFunction} from "express";
import { logger } from "../utils/logger.util";

/**
 * Global error handler middleware for Express application
 * 
 * This middleware is the last line of defense in error handling. It catches all errors
 * that bubble up through the application and formats them consistently for both
 * logging and client response.
 * 
 * @param err - Error object (AppError or native Error)
 * @param req - Express request object
 * @param res - Express response object
 * @param __ - NextFunction (unused, but required by Express error middleware signature)
 * 
 * Error Handling Flow:
 * 1. Check environment (production vs development)
 * 2. Determine error type (AppError vs System Error)
 * 3. Log error details with context
 * 4. Send appropriate response to client
 * 
 * Security Considerations:
 * - Stack traces are NEVER sent to production clients (information disclosure)
 * - Detailed error messages are sanitized in production
 * - All errors are logged server-side regardless of environment
 * - IP addresses are logged for security auditing
 */
export const errorHandler = (err: AppError, req: Request, res: Response, __: NextFunction) => {
    // Environment detection - determines what information is safe to expose
    const isProduction = process.env.NODE_ENV === 'production';

    // Handle known application errors (validation, business logic, etc.)
    if(isAppError(err)) {
        // Structured logging for observability and debugging
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: 'AppError', // Indicates this is a handled application error
            status: err.status,
            statusCode: err.statusCode || 500,
            message: err.message,
            path: req.path, // Request path for context
            method: req.method, // HTTP method for auditing
            ip: req.ip || req.socket.remoteAddress, // Client IP for security tracking
            // SECURITY: Stack trace only logged server-side, never in production response
            // Why? Stack traces reveal internal file paths, library versions, and code structure
            // that attackers can use to identify vulnerabilities
            stack: isProduction ? undefined : err.stack
        };

        // Log to centralized logging system (CloudWatch, ELK, etc.)
        logger.error(JSON.stringify(logEntry));

        // Send sanitized error response to client
        res.status(err.statusCode || 500).json({
            status: err.status,
            message: err.message, // AppError messages are safe to expose (user-facing)
            // SECURITY: Additional error details only in development
            // Production clients receive only status and message
            error: isProduction ? undefined : err?.error
        })

        return
    }

    // Handle unexpected system errors (uncaught exceptions, third-party library errors, etc.)
    // These represent bugs or infrastructure failures, not user errors
    const logEntry = {
        timestamp: new Date().toISOString(),
        type: 'SystemError', // Indicates unexpected/unhandled error
        status: 'failed',
        statusCode: 500,
        message: 'Internal server error',
        path: req.path,
        method: req.method,
        ip: req.ip || req.socket.remoteAddress,
        // SECURITY: Full stack trace logged server-side for debugging
        // This is critical for fixing bugs but must never reach the client
        stack: err instanceof Error ? err.stack : String(err)
    };

    // Log full error details for engineering team to investigate
    logger.error(JSON.stringify(logEntry));

    // SECURITY: Different responses for production vs development
    // Production: Generic error message only (prevents information disclosure)
    // Development: Include error message for faster debugging
    if (isProduction) {
        // Generic response - gives no clues about internal implementation
        res.status(500).json({
            status: "failed",
            message: "Internal server error"
        })
    } else {
        // Development response - includes error message for debugging
        // Never deploy to production with NODE_ENV !== 'production'
        res.status(500).json({
            status: "failed",
            message: "internal server error",
            error: err instanceof Error ? err.message : String(err)
        })
    }
    
    return

}
