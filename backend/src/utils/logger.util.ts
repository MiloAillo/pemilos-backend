import pino from "pino"
import winston from "winston";
import path from "path";
import fs from "fs";

export const logger = require("pino")()

// Ensure logs directory exists
const logDir = path.join(__dirname, "../../logs");
try {
  fs.mkdirSync(logDir, { recursive: true });
} catch (err: any) {
  if (err.code !== 'EEXIST') throw err;
}

export const fileLogger = winston.createLogger({
  level: "info", // you can change to "debug", "error", etc.
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, "app.log"),
      level: "info",
    }),
  ],
});