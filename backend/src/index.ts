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

const cors = require('cors')

var cookieParser = require('cookie-parser')

dotenv.config({ path: path.resolve(__dirname, "../../.env.dev") });

const app = express();
const port = String(process.env.APP_PORT || "3000");

app.use(cors({
     // origin: "http://localhost:5174",
     // credentials: true
}))

app.use(cookieParser())
app.use(express.json())

app.use(rateLimitMiddleware);
app.use(express.json());
app.use("/api/v1/", v1Route);
app.use(errorHandler);


bootstrap(app, port);