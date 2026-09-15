import { Request, Response, NextFunction } from 'express';
import { ObjectSchema } from "joi";
import { logger } from "../utils/logger.util";

/**
 * Joi validation middleware factory
 * 
 * Purpose:
 * - Validates incoming request body against Joi schema
 * - Fails fast at API boundary before business logic
 * - Returns consistent validation error format
 * 
 * Design Pattern: Middleware Factory (Higher-Order Function)
 * - Takes schema as input, returns configured middleware
 * - Each route declares validation schema inline
 * - Validation logic is reusable across all routes
 * 
 * Example usage:
 *   router.post('/vote', validateDTO(voteSchema), voteController.submit);
 * 
 * Why validate at middleware layer?
 * - Separates validation from business logic (Single Responsibility)
 * - Controllers receive pre-validated data
 * - Easy to test validation independently
 * 
 * Security principle: Trust nothing from the client
 * - All user input must pass through validation
 * - Prevents injection, type coercion, and unexpected fields
 */

/**
 * Creates a validation middleware for the given Joi schema
 * 
 * Validation flow:
 * 1. Extract req.body
 * 2. Validate against schema with abortEarly: false (collect all errors)
 * 3. If invalid:
 *    - Production: Return generic error (don't leak schema details)
 *    - Development: Return detailed field-level errors for debugging
 * 4. If valid: Call next() to proceed to controller
 * 
 * Error response format:
 * 
 * Production:
 *   {
 *     status: "error",
 *     message: "Validation failed. Please check your input.",
 *     errorCount: 3
 *   }
 * 
 * Development:
 *   {
 *     status: "error",
 *     message: "Failed on validation",
 *     errors: [
 *       { field: "username", message: "username is required" },
 *       { field: "password", message: "password must be at least 6 characters" }
 *     ]
 *   }
 * 
 * Why different formats?
 * - Production: Prevent attackers from discovering schema structure
 * - Development: Help frontend developers fix API requests quickly
 * 
 * @param schema - Joi ObjectSchema defining expected request body structure
 * @returns Express middleware function that validates req.body
 */
export const validateDTO = (schema: ObjectSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {
        // Validate request body against schema
        // abortEarly: false ensures we collect all validation errors, not just the first
        const result = schema.validate(req.body, { abortEarly: false });

        if (result.error) {
            const isProduction = process.env.NODE_ENV === 'production';
            
            if (isProduction) {
                // Production: Generic error (security through obscurity)
                // Don't reveal field names or validation rules to potential attackers
                res.status(400).json({
                    status: "error",
                    message: "Validation failed. Please check your input.",
                    errorCount: result.error.details.length
                });
            } else {
                // Development: Detailed field-level errors
                // Maps Joi's ValidationErrorItem to our standard error format
                const errors = result.error.details.map(detail => ({
                    field: detail.path.join('.'),  // e.g., "candidates[0].label"
                    message: detail.message         // Joi's human-readable error message
                }));
                res.status(400).json({
                    status: "error",
                    message: "Failed on validation",
                    errors: errors
                });
            }
            
            logger.debug("Validation Fails");
            return; // Stop middleware chain, don't call next()
        }
        
        logger.debug("validation Success");

        // Validation passed, proceed to next middleware/controller
        next();
    };
}