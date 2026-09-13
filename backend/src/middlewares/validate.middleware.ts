import { Request, Response, NextFunction } from 'express';
import { ObjectSchema } from "joi";
import { logger } from "../utils/logger.util";

export const validateDTO = (schema: ObjectSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.validate(req.body, { abortEarly: false });

        if (result.error) {
            const isProduction = process.env.NODE_ENV === 'production';
            
            if (isProduction) {
                res.status(400).json({
                    status: "error",
                    message: "Validation failed. Please check your input.",
                    errorCount: result.error.details.length
                });
            } else {
                const errors = result.error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message
                }));
                res.status(400).json({
                    status: "error",
                    message: "Failed on validation",
                    errors: errors
                });
            }
            
            logger.debug("Validation Fails");
            return;
        }
        logger.debug("validation Success");

        next();
    };
}