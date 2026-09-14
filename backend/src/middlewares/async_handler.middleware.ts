import { Request, Response, NextFunction } from "express";

/**
 * Async Handler Middleware
 * 
 * Purpose:
 * Express.js does not automatically catch errors thrown in async route handlers.
 * Without this wrapper, unhandled promise rejections would crash the server or
 * result in hanging requests without proper error responses.
 * 
 * Why This Exists:
 * - Express middleware system was designed for synchronous handlers
 * - Async/await errors don't automatically propagate to Express error handlers
 * - Manual try-catch blocks in every async handler create code duplication
 * 
 * How It Works:
 * 1. Wraps async route handlers in a higher-order function
 * 2. Catches any rejected promises from the wrapped handler
 * 3. Forwards errors to Express error handling middleware via next(error)
 * 
 * Usage Pattern:
 * export const myHandler = asyncHandler(async (req, res) => {
 *   const data = await someAsyncOperation(); // Errors automatically caught
 *   res.json(data);
 * });
 * 
 * Without asyncHandler:
 * - Unhandled promise rejections would trigger process warnings
 * - Client would not receive error response (request timeout)
 * - Error logging and monitoring would not capture the failure
 * 
 * With asyncHandler:
 * - Errors propagate to centralized error middleware
 * - Consistent error response format
 * - Proper HTTP status codes and logging
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
    (req: Request, res: Response, next: NextFunction) => {
      // Execute the async handler and catch any promise rejections
      // Forward caught errors to Express error handling chain
      fn(req, res, next).catch(next);
    };
