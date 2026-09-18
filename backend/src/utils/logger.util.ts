/**
 * Logging Utility
 * 
 * PURPOSE:
 * Provides two separate logging mechanisms for different use cases:
 * 1. `logger` (Pino) - Fast, structured console logging for development and runtime debugging
 * 2. `fileLogger` (Winston) - Persistent file-based logging for audit trails and compliance
 * 
 * WHEN TO USE:
 * - Use `logger` for general application logging (requests, errors, debug info)
 * - Use `fileLogger` specifically for audit events that require persistence (see audit.util.ts)
 * 
 * SECURITY IMPLICATIONS:
 * - Never log sensitive data: passwords, tokens, API keys, PII without masking
 * - Logs may be stored long-term and accessed by multiple teams
 * - Audit logs (app.log) may be required for compliance (GDPR, SOC2)
 * 
 * PRODUCTION VS DEVELOPMENT:
 * - Development: Both loggers output detailed information
 * - Production: Consider log level filtering (ERROR/WARN only) to reduce I/O overhead
 * - Production: Implement log rotation to prevent disk exhaustion
 * 
 * INTEGRATION:
 * - Import `logger` for general application logging
 * - Import `fileLogger` only when persistent audit logging is required
 * - audit.util.ts uses fileLogger for compliance-grade event logging
 */

import pino from "pino"
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import fs from "fs";

/**
 * Pino Logger - Fast, structured JSON logging
 * 
 * CHARACTERISTICS:
 * - Low overhead, suitable for high-throughput applications
 * - Outputs JSON-formatted logs to stdout
 * - Ideal for container environments (Docker/Kubernetes) where logs are captured by orchestrators
 * - Fast asynchronous I/O minimizes performance impact
 * 
 * USE CASES:
 * - Request/response logging in middleware
 * - Error tracking and stack traces
 * - Performance metrics and timing information
 * - Development debugging
 * 
 * EXAMPLE:
 *   logger.info({ userId: '123', action: 'login' }, 'User logged in');
 *   logger.error({ err, userId: '123' }, 'Authentication failed');
 */
export const logger = require("pino")()

/**
 * Ensure logs directory exists
 * 
 * RATIONALE:
 * Winston requires the target directory to exist before writing files.
 * Creating it at module initialization prevents runtime errors.
 * 
 * SECURITY NOTE:
 * - Ensure proper file permissions on production servers (chmod 750 or restrictive)
 * - Logs may contain IP addresses, user actions, and system state
 */
const logDir = path.join(__dirname, "../../logs");
try {
  fs.mkdirSync(logDir, { recursive: true });
} catch (err: any) {
  // EEXIST means directory already exists, which is fine
  if (err.code !== 'EEXIST') throw err;
}

/**
 * Winston File Logger - Persistent audit logging
 * 
 * CHARACTERISTICS:
 * - Writes to persistent files on disk (backend/logs/app.log)
 * - Human-readable timestamp format for compliance reviews
 * - Synchronous I/O ensures log entries are written even during crashes
 * 
 * USE CASES:
 * - Security audit trails (login attempts, permission changes, data access)
 * - Compliance logging (GDPR Article 30 records, SOC2 audit requirements)
 * - Incident investigation and forensics
 * - Regulatory reporting
 * 
 * WHEN NOT TO USE:
 * - High-frequency operational logging (use `logger` instead)
 * - Performance-critical paths (file I/O has latency)
 * 
 * FILE ROTATION IMPLEMENTATION:
 * - Uses winston-daily-rotate-file for automatic log rotation
 * - Hourly rotation (YYYY-MM-DD-HH) optimized for single-day election events
 * - 20MB max per file prevents large log files
 * - 7-day retention with compressed archives (.gz) saves disk space
 * 
 * PRODUCTION HARDENING:
 * - Implement log rotation to prevent disk exhaustion
 * - Consider log shipping to external SIEM (Splunk, ELK, Datadog)
 * - Encrypt logs at rest if containing sensitive audit data
 * 
 * INTEGRATION:
 * - Primarily used by audit.util.ts for security event logging
 * - Can be used directly for critical application events requiring persistence
 * 
 * EXAMPLE:
 *   fileLogger.info(JSON.stringify({ 
 *     action: 'admin_access', 
 *     userId: '123', 
 *     timestamp: new Date().toISOString() 
 *   }));
 */
export const fileLogger = winston.createLogger({
  // Log level threshold - only logs at this level and above are written
  // Levels: error(0) > warn(1) > info(2) > http(3) > verbose(4) > debug(5) > silly(6)
  level: "info",
  
  // Format pipeline: timestamp → custom printf formatter
  format: winston.format.combine(
    // ISO-style timestamp for consistency with international compliance standards
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    
    // Custom format optimized for human readability during audit reviews
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  
  // Transports define where logs are written
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, "app-%DATE%.log"),
      datePattern: "YYYY-MM-DD-HH",        // Hourly rotation for election day
      maxSize: "20m",                       // Rotate at 20MB
      maxFiles: "7d",                       // Keep 7 days of logs
      zippedArchive: true,                  // Compress old logs (.gz)
      auditFile: path.join(logDir, ".audit.json")  // Track rotation metadata
    }),
  ],
});