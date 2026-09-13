import express from "express";
import { errorHandler } from "./exceptions/error_handler.exception";
import { rateLimitMiddleware } from "./middlewares/rate-limit.middleware";
import { connectToMongoose } from "./configs/db.config";
import v1Route from "./routes/v1.route";
import { logger } from "./utils/logger.util";
import dotenv from "dotenv";
import path from "path";
import { createServer, Server } from "http";
import { bootstrap, shutdown } from "./utils/server.util";
import helmet from "helmet";
import cors from "cors";
const cookieParser = require('cookie-parser')

const NODE_ENV = process.env.NODE_ENV || 'development';
const envFile = NODE_ENV === 'production' ? '.env' : '.env.dev';
const envPath = path.resolve(__dirname, "../../", envFile);
dotenv.config({ path: envPath });

const requiredEnvVars = [
  'APP_PORT',
  'MONGODB_ROOT_USER',
  'MONGODB_ROOT_PASSWORD',
  'MONGODB_DATABASE',
  'MONGODB_HOST',
  'MONGODB_PORT',
  'REDIS_HOST',
  'REDIS_PORT',
  'JWT_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

if (process.env.JWT_KEY && process.env.JWT_KEY.length < 32) {
  logger.error('JWT_KEY must be at least 32 characters long');
  process.exit(1);
}

const app = express();
const port = String(process.env.APP_PORT || "3000");

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5174')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600
};

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true
}));

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(rateLimitMiddleware);
app.use("/api/v1/", v1Route);
app.use(errorHandler);

bootstrap(app, port);