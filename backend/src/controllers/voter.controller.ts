import path from "path";
import fs from "fs";
import csv from "csv-parser";
import { Voter } from "../utils/types.util";
import { createError } from "../exceptions/error.exception";
import { generatePassword } from "../utils/auth.util";
import { logger } from "../utils/logger.util";
import {
  voterCount,
  voterGetResult,
  voterResetVote,
  voterSaveMany,
  voterSaveVote,
} from "../services/voter.service";
import { asyncHandler } from "../middlewares/async_handler.middleware";
import { PostInsertVote } from "../dtos/vote.dto";
import { getPayload } from "../utils/jwt.util";

const sanitizeCSVField = (field: string): string => {
  if (!field) return field;
  
  const fieldStr = String(field);
  const dangerousChars = ['=', '+', '-', '@', '\t', '\r'];
  
  if (dangerousChars.some(char => fieldStr.startsWith(char))) {
    return `'${fieldStr}`;
  }
  
  return fieldStr;
};

export const uploadVoterFromCsv = asyncHandler(async (req, res) => {
  const voters: Voter[] = [];

  logger.info(req.file);

  if (!req.file) {
    throw createError("failed", "no file attached", 400);
  }

  const filePath = path.resolve(req.file.path);

  logger.info(filePath);

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => {
        console.log(data)
        voters.push({
          name: sanitizeCSVField(data.NAME),
          username: sanitizeCSVField(data.USERNAME),
          class: sanitizeCSVField(data.CLASS),
          password: generatePassword(data.USERNAME),
          isVoted: false,
        });
      })
      .on("end", resolve)
      .on("error", reject);
    
  });

  await voterSaveMany(voters);
  logger.info("saved voters");
  fs.unlinkSync(filePath);

  res.status(201).json({
    status: "success",
    message: "Voters, successfully created",
  });
});

export const exportTokenizedVoterFromCSV = asyncHandler(async (req, res) => {
  const voters: Voter[] = [];

  if (!req.file) {
    throw createError("failed", "no file attached", 400);
  }

  const filePath = path.resolve(req.file.path);

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => {
        voters.push({
          name: sanitizeCSVField(data.NAMA),
          username: sanitizeCSVField(data.USERNAME),
          class: sanitizeCSVField(data.KELAS),
          password: sanitizeCSVField(data.TOKEN),
          isVoted: false,
        });
      })
      .on("end", resolve)
      .on("error", reject);
  });

  await voterSaveMany(voters);
  logger.info("saved voters");
  fs.unlinkSync(filePath);

  res.status(201).json({
    status: "success",
    message: "Voters, successfully created",
  });
});

export const vote = asyncHandler(async (req, res) => {
  // Parse the payload
  const { osis, mpk } = req.body;

  const { id } = getPayload(req);

  // Calls the service
  await voterSaveVote(
    {
      osis,
      mpk,
    } as PostInsertVote,
    id,
  );

  res.status(201).json({
    status: "success",
    message: "successfully inserted vote",
  });
});

export const resetVote = asyncHandler(async (req, res) => {
  // Take the payload
  const { username } = req.body;
  const { id } = getPayload(req);

  // calls the service with adminId
  await voterResetVote(username, id);

    res.status(200).json({
      status: "success",
      message: "user vote status resetted",
    });
});

// This controller will count and return how much voter that voted, and nah.
export const countVoter = asyncHandler(async (req, res) => {
  // Calls the service
  const result = await voterCount();



  res.status(200).json({
    status: "success",
    message: "successfully get the voter count",
    data: result,
  });
  return;
});

export const getLiveCount = asyncHandler(async (req, res) => {
  const result = {
    osis: await voterGetResult("osis"),
    mpk: await voterGetResult("mpk"),
  };

  res.status(200).json({
    "data": result,
  })
})