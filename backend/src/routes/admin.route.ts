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
import { authMiddleware } from "../middlewares/auth.middleware";
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

  const uploadPath = nodeEnv == "dev" 
    ? path.resolve(__dirname, "..", "..", "uploads")
    : path.resolve("/app/uploads");

  return multer({
    dest: uploadPath,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit for large CSV files
    },
    fileFilter: (req, file, cb) => {
      // MIME type validation
      const allowedMimeTypes = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(new Error('Invalid file type. Only CSV files are allowed.'));
      }

      // Extension validation
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext !== '.csv') {
        return cb(new Error('Invalid file extension. Only .csv files are allowed.'));
      }

      // Path traversal protection - sanitize filename
      const basename = path.basename(file.originalname);
      if (basename !== file.originalname || basename.includes('..')) {
        return cb(new Error('Invalid filename detected.'));
      }

      cb(null, true);
    },
  });
}

router.get("/vote/status", getVoteStatus);
router.use(authMiddleware);
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
