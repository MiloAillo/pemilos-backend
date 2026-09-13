import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { getCandidate } from "../controllers/candidate.controller";
import { rateLimitMiddleware } from "../middlewares/rate-limit.middleware";

const router = Router()

router.use(authMiddleware)
router.get("/", getCandidate)

export default router