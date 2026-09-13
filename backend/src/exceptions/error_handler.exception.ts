import {AppError, isAppError} from "./error.exception";
import {Request, Response, NextFunction} from "express";
import { logger } from "../utils/logger.util";

export const errorHandler = (err: AppError, _: Request, res: Response, __: NextFunction) => {
    const isProduction = process.env.NODE_ENV === 'production';

    if(isAppError(err)) {
        res.status(err.statusCode || 500).json({
            status: err.status,
            message: err.message,
            error: isProduction ? undefined : err?.error
        })

        logger.error(`${err.status}, message: ${err.message}`);
        return
    }

    if (isProduction) {
        res.status(500).json({
            status: "failed",
            message: "Internal server error"
        })
    } else {
        res.status(500).json({
            status: "failed",
            message: "internal server error",
            error: err instanceof Error ? err.message : String(err)
        })
    }
    
    logger.error(`internal server error: ${err instanceof Error ? err.stack : String(err)}`);
    return

}
