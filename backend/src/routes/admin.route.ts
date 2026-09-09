import { Request, Response, Router } from "express";
import multer from "multer";
import {
  countVoter,
  exportTokenizedVoterFromCSV,
  getLiveCount,
  resetVote,
  uploadVoterFromCsv,
} from "../controllers/voter.controller";
import path from "path";
import { adminMiddleware } from "../middlewares/admin.middleware";
import { validateDTO } from "../middlewares/validate.middleware";
import { getUser, postUserCreate } from "../dtos/user.dto";
import {
  createUser,
  deleteUser,
  getAllUser,
  getUserById,
} from "../controllers/user.controller";
import { postCandidateCreate } from "../dtos/candidate.dto";
import {
  createCandidate,
  deleteCandidate,
} from "../controllers/candidate.controller";
import { deleteResetVote } from "../dtos/vote.dto";

import {
  getVoteStatus,
  toggleAllowVote,
} from "../controllers/setting.controller";
import { isAdmin, isUser } from "../controllers/auth.controller";

const router = Router();

function getUpload(): multer.Multer {
  const nodeEnv = process.env.NODE_ENV ?? "dev";

  if (nodeEnv == "dev") {
    return multer({
      dest: path.resolve(__dirname, "..", "..", "uploads"),
    });
  } else {
    return multer({
      dest: path.resolve("/app/uploads"),
    });
  }
}

router.get("/vote/status", getVoteStatus);
router.use(adminMiddleware);
router.post("/upload/csv", getUpload().single("file"), uploadVoterFromCsv);
router.post(
  "/upload/csv/token",
  getUpload().single("file"),
  exportTokenizedVoterFromCSV,
);
router.post("/user", validateDTO(postUserCreate), createUser);
router.post("/candidate", validateDTO(postCandidateCreate), createCandidate);
router.delete("/candidate/:id", deleteCandidate);
router.put("/reset", validateDTO(deleteResetVote), resetVote);
router.get("/user", validateDTO(getUser), getAllUser);
router.delete("/user/:id", deleteUser);
router.get("/user/:id", getUserById);
router.get("/count", countVoter);
router.put("/vote/status", toggleAllowVote);
router.put("/check/user", isUser);
router.put("/check/admin", isAdmin);
router.get("/live/count", getLiveCount);

export default router;
