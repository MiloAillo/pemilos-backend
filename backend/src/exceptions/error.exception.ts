/**
 * Standardized error handling utilities
 * 
 * Purpose:
 * - Consistent error response format across all endpoints
 * - Type-safe error creation and detection
 * - Separates application errors from system errors
 * 
 * Design Pattern: Error Factory
 * - createError() centralizes error object creation
 * - isAppError() provides type guard for error middleware
 * - All errors flow through centralized error handler middleware
 * 
 * Benefits:
 * - Frontend can rely on consistent { status, message, statusCode } shape
 * - Easy to add correlation IDs, stack traces, or monitoring hooks
 * - Type safety prevents missing fields in error responses
 */

/**
 * Application error structure
 * 
 * Returned by all API endpoints on error
 * 
 * Fields:
 * - status: Human-readable status ("error", "fail")
 * - message: User-facing error description
 * - error: Optional detailed error info (hidden in production)
 * - statusCode: HTTP status code (400, 401, 403, 404, 500, etc.)
 * 
 * JSend conventions:
 * - "error": Server error (500+)
 * - "fail": Client error (400-499)
 * 
 * Example:
 *   {
 *     status: "fail",
 *     message: "Invalid credentials",
 *     statusCode: 401
 *   }
 */
export type AppError = {
    status: string;
    message: string;
    error?: object;      // Optional: stack trace, validation details
    statusCode: number;
};

/**
 * Type guard to distinguish AppError from generic errors
 * 
 * Used in:
 * - Error middleware to determine if error is application-level or system-level
 * - Prevents leaking stack traces from unexpected errors
 * 
 * Why needed?
 * - TypeScript narrows type after this check
 * - Allows safe access to AppError fields without casting
 * 
 * Example usage:
 *   if (isAppError(err)) {
 *     res.status(err.statusCode).json(err);
 *   } else {
 *     res.status(500).json({ status: "error", message: "Internal server error" });
 *   }
 * 
 * @param error - Unknown error object from try/catch or Promise.catch
 * @returns Type predicate indicating if error matches AppError shape
 */
export const isAppError = (error: unknown): error is AppError => {
    return (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        "status" in error &&
        "statusCode" in error
    );
};

/**
 * Factory function for creating standardized application errors
 * 
 * Why a factory?
 * - Ensures all errors have consistent shape
 * - Single place to add logging, monitoring, or correlation IDs
 * - Prevents typos in error field names
 * 
 * Usage pattern:
 *   throw createError("fail", "User not found", 404);
 *   throw createError("error", "Database connection failed", 500, dbError);
 * 
 * Status conventions:
 * - "fail": Client-side error (bad request, auth failure, not found)
 * - "error": Server-side error (database down, external service timeout)
 * 
 * @param status - JSend status: "error" or "fail"
 * @param message - User-facing error message
 * @param statusCode - HTTP status code
 * @param error - Optional error details (logs, stack trace)
 * @returns Structured AppError object ready to be thrown or returned
 */
export const createError = (status: string, message: string, statusCode: number, error?: unknown): AppError => {
    return { status, message, error: error as object, statusCode, };
};