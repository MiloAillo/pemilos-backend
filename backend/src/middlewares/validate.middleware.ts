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

/**
 * Creates a validation middleware for query parameters (GET requests)
 * 
 * Similar to validateDTO but validates req.query instead of req.body
 * 
 * Validation flow:
 * 1. Extract req.query
 * 2. Convert query string values to appropriate types (Joi coercion)
 * 3. Validate against schema
 * 4. Reject with 400 if validation fails
 * 5. Proceed to controller if valid
 * 
 * Security Benefits:
 * - Prevents NoSQL injection via query object parameters (e.g., role[$ne]=admin)
 * - Type checks all query parameters (prevents type confusion attacks)
 * - Rejects unknown query parameters (stripUnknown: true prevents parameter pollution)
 * - Bounds checking prevents DoS via large offsets/limits
 * 
 * Query String Coercion:
 * - "true"/"false" → boolean
 * - "123" → number
 * - Undefined params → schema defaults
 * 
 * Example usage:
 *   router.get('/users', validateQueryDTO(getUserSchema), getUsers);
 * 
 * @param schema - Joi ObjectSchema defining expected query parameters
 * @returns Express middleware function that validates req.query
 */
export const validateQueryDTO = (schema: ObjectSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {
        // Validate query parameters against schema
        // abortEarly: false ensures we collect all validation errors
        // stripUnknown: true removes any query params not in schema (security)
        // convert: true enables type coercion (string "1" → number 1)
        const result = schema.validate(req.query, {
            abortEarly: false,
            stripUnknown: true,
            convert: true
        });

        if (result.error) {
            const isProduction = process.env.NODE_ENV === 'production';
            
            if (isProduction) {
                // Production: Generic error (security through obscurity)
                res.status(400).json({
                    status: "error",
                    message: "Invalid query parameters. Please check your request.",
                    errorCount: result.error.details.length
                });
            } else {
                // Development: Detailed field-level errors
                const errors = result.error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message
                }));
                res.status(400).json({
                    status: "error",
                    message: "Query parameter validation failed",
                    errors: errors
                });
            }
            
            logger.debug("Query validation failed");
            return; // Stop middleware chain
        }
        
        // Replace req.query properties with validated and type-coerced values
        // Note: In Express 5 / modern Node, req.query is a getter-only property on IncomingMessage,
        // so direct assignment (req.query = result.value) throws TypeError.
        // Instead, we mutate the existing object or redefine the property.
        Object.defineProperty(req, 'query', {
            value: result.value,
            writable: true,
            enumerable: true,
            configurable: true
        });
        
        logger.debug("Query validation success");

        // Validation passed, proceed to next middleware/controller
        next();
    };
}