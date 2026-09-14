import {AppError, isAppError} from "./error.exception";
import {Request, Response, NextFunction} from "express";
import { logger } from "../utils/logger.util";

export const errorHandler = (err: AppError, req: Request, res: Response, __: NextFunction) => {
    const isProduction = process.env.NODE_ENV === 'production';

    if(isAppError(err)) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: 'AppError',
            status: err.status,
            statusCode: err.statusCode || 500,
            message: err.message,
            path: req.path,
            method: req.method,
            ip: req.ip || req.socket.remoteAddress,
            stack: isProduction ? undefined : err.stack
        };

        logger.error(JSON.stringify(logEntry));

        res.status(err.statusCode || 500).json({
            status: err.status,
            message: err.message,
            error: isProduction ? undefined : err?.error
        })

        return
    }

    const logEntry = {
        timestamp: new Date().toISOString(),
        type: 'SystemError',
        status: 'failed',
        statusCode: 500,
        message: 'Internal server error',
        path: req.path,
        method: req.method,
        ip: req.ip || req.socket.remoteAddress,
        stack: err instanceof Error ? err.stack : String(err)
    };

    logger.error(JSON.stringify(logEntry));

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
    
    return

}
