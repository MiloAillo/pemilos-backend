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

/**
 * ⚠️ SECURITY: CSV Injection Prevention - Validation Approach
 * 
 * Validates CSV field values and rejects those that could be interpreted as formulas.
 * 
 * Attack Vector:
 * - Excel, LibreOffice, and Google Sheets execute formulas starting with: =, +, -, @
 * - Malicious CSV: =cmd|'/c calc'!A1 could execute arbitrary commands
 * - Tab (\t) and carriage return (\r) can be used for injection payloads
 * 
 * Prevention Strategy:
 * - REJECT inputs starting with dangerous characters at import time
 * - Prevents mutation of canonical data (no escape prefix added)
 * - Ensures clean data in database (no special characters)
 * - Username in password matches stored username
 * 
 * Why Validation over Sanitization:
 * - Sanitization adds escape prefix (') causing username/password field mismatch
 * - Password generation uses original username, but stored username is prefixed
 * - Rejection ensures data integrity and prevents authentication issues
 * 
 * @param field - Raw CSV field value from uploaded file
 * @param fieldName - Field name for error message
 * @throws 400 - Field starts with dangerous character
 */
const validateCSVField = (field: string, fieldName: string): void => {
  if (!field) return;
  
  const fieldStr = String(field);
  // ⚠️ Characters that can trigger formula execution in spreadsheet applications
  const dangerousChars = ['=', '+', '-', '@', '\t', '\r'];
  
  // Reject dangerous input at source
  if (dangerousChars.some(char => fieldStr.startsWith(char))) {
    throw createError(
      "failed",
      `Invalid ${fieldName}: "${field}" - cannot start with formula characters (=, +, -, @, tab, CR)`,
      400
    );
  }
};

/**
 * Upload Voter List from CSV File
 * 
 * REQUEST FLOW:
 * 1. Admin uploads CSV file via multipart/form-data (handled by multer middleware)
 * 2. Controller validates file presence
 * 3. Stream-parse CSV rows (columns: NAME, USERNAME, CLASS)
 * 4. ⚠️ Sanitize each field against CSV injection attacks
 * 5. Generate deterministic password from username
 * 6. Batch insert all voters into MongoDB
 * 7. Delete temporary uploaded file
 * 8. Return success response
 * 
 * ⚠️ SECURITY CONSIDERATIONS:
 * - File upload should be restricted by multer middleware (file size, MIME type)
 * - CSV injection prevention via sanitizeCSVField() on all user-controlled fields
 * - Password generation uses generatePassword() - should be cryptographically secure
 * - Temporary file cleanup prevents disk exhaustion attacks
 * - No input validation on CSV structure - malformed CSV will cause silent failures
 * 
 * EDGE CASES:
 * - Large CSV files are streamed (memory-efficient)
 * - Duplicate usernames will fail at DB unique constraint (not handled gracefully here)
 * - Empty CSV will succeed with 0 inserts
 * 
 * @param req.file - Multer file object with path to uploaded CSV
 * @returns 201 - Voters successfully created
 * @throws 400 - No file attached
 * @throws 500 - Database insertion failure (from voterSaveMany)
 */
export const uploadVoterFromCsv = asyncHandler(async (req, res) => {
  const voters: Voter[] = [];

  logger.info(req.file);

  // Validate file presence (multer middleware should prevent this, but defense in depth)
  if (!req.file) {
    throw createError("failed", "no file attached", 400);
  }

  const filePath = path.resolve(req.file.path);

  logger.info(filePath);

  try {
    // Stream-parse CSV to avoid loading entire file into memory
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (data) => {
          console.log(data)
          
          // ⚠️ SECURITY: Validate all fields and reject CSV injection
          validateCSVField(data.NAME, "NAME");
          validateCSVField(data.USERNAME, "USERNAME");
          validateCSVField(data.CLASS, "CLASS");
          
          voters.push({
            name: data.NAME,
            username: data.USERNAME,
            class: data.CLASS,
            // Generate deterministic password from validated username
            password: generatePassword(data.USERNAME),
            isVoted: false,
          });
        })
        .on("end", resolve)
        .on("error", reject);
      
    });

    // Batch insert with ordered:true (stops on first error, maintains insertion order)
    await voterSaveMany(voters);
    logger.info("saved voters");

    res.status(201).json({
      status: "success",
      message: "Voters, successfully created",
    });
  } finally {
    // ⚠️ SECURITY: Clean up temporary file even on error to prevent disk exhaustion
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

/**
 * Upload Voter List with Pre-Generated Tokens from CSV
 * 
 * REQUEST FLOW:
 * 1. Admin uploads CSV file with pre-generated tokens/passwords
 * 2. Controller validates file presence
 * 3. Stream-parse CSV rows (columns: NAMA, USERNAME, KELAS, TOKEN)
 * 4. ⚠️ Sanitize ALL fields including TOKEN against CSV injection
 * 5. Batch insert all voters into MongoDB
 * 6. Delete temporary uploaded file
 * 7. Return success response
 * 
 * ⚠️ SECURITY CONSIDERATIONS:
 * - TOKEN field contains pre-generated passwords in plain text (by design)
 * - Must be validated to prevent CSV injection
 * - Tokens stored as-is in database (no hashing performed)
 * - Duplicate username/token pairs can occur (DB constraint will reject)
 * 
 * DIFFERENCE FROM uploadVoterFromCsv:
 * - Uses pre-existing TOKEN field instead of generatePassword()
 * - Different CSV column names (NAMA vs NAME, KELAS vs CLASS)
 * - Tokens may be human-readable (security risk if leaked)
 * 
 * @param req.file - Multer file object with path to uploaded CSV
 * @returns 201 - Voters successfully created
 * @throws 400 - No file attached
 * @throws 500 - Database insertion failure
 */
export const exportTokenizedVoterFromCSV = asyncHandler(async (req, res) => {
  const voters: Voter[] = [];

  if (!req.file) {
    throw createError("failed", "no file attached", 400);
  }

  const filePath = path.resolve(req.file.path);

  try {
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (data) => {
          // ⚠️ SECURITY: Validate all fields and reject CSV injection
          validateCSVField(data.NAMA, "NAMA");
          validateCSVField(data.USERNAME, "USERNAME");
          validateCSVField(data.KELAS, "KELAS");
          validateCSVField(data.TOKEN, "TOKEN");
          
          voters.push({
            name: data.NAMA,
            username: data.USERNAME,
            class: data.KELAS,
            password: data.TOKEN, // Pre-generated token validated
            isVoted: false,
          });
        })
        .on("end", resolve)
        .on("error", reject);
    });

    await voterSaveMany(voters);
    logger.info("saved voters");

    res.status(201).json({
      status: "success",
      message: "Voters, successfully created",
    });
  } finally {
    // ⚠️ SECURITY: Clean up temporary file even on error to prevent disk exhaustion
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

/**
 * Submit Vote for OSIS and MPK Candidates
 * 
 * REQUEST FLOW:
 * 1. Extract JWT token from Authorization header (via getPayload middleware)
 * 2. Parse osis and mpk candidate IDs from request body
 * 3. Validate JWT and extract voter ID
 * 4. Forward to voterSaveVote service for processing
 *    - Acquires distributed lock (Redlock) to prevent race conditions
 *    - Validates voting is currently allowed (isVotingAllowed flag in Redis)
 *    - Validates candidate existence and labels
 *    - Checks voter hasn't already voted (isVoted flag + Vote collection query)
 *    - Inserts vote records for both OSIS and MPK
 *    - Marks voter as voted
 *    - Triggers live count push to frontend via Pusher
 * 5. Return success response
 * 
 * ⚠️ SECURITY CONSIDERATIONS:
 * - Authentication enforced by getPayload() - throws 401 if token invalid/expired
 * - Authorization enforced in service layer (admin role cannot vote)
 * - Race condition prevention via Redlock distributed locking (30-second timeout)
 * - Double-vote prevention via dual checks: User.isVoted flag + Vote.findOne()
 * - Candidate validation ensures votes can't be cast for non-existent/wrong-label candidates
 * - No rate limiting on this endpoint - could be abused for DoS (lock exhaustion)
 * 
 * FAILURE SCENARIOS:
 * - Redis down: getRedlock() may fail, vote request fails entirely
 * - Lock acquisition timeout (30s): request fails, voter must retry
 * - Concurrent vote attempts: second attempt gets 400 "user already voted"
 * - Invalid candidate IDs: 400 "candidate chosen is not valid"
 * - Voting disabled: 401 "vote not allowed"
 * 
 * @param req.body.osis - MongoDB ObjectId of selected OSIS candidate
 * @param req.body.mpk - MongoDB ObjectId of selected MPK candidate
 * @param req.headers.authorization - JWT token containing voter ID
 * @returns 201 - Vote successfully recorded
 * @throws 401 - Unauthorized (invalid token, voting disabled)
 * @throws 400 - Invalid candidate, user already voted
 * @throws 500 - Lock acquisition failure, database errors
 */
export const vote = asyncHandler(async (req, res) => {
  // Parse the payload
  const { osis, mpk } = req.body;

  // ⚠️ SECURITY: Extract and verify JWT token, throws if invalid/expired
  const { id } = getPayload(req);

  // Calls the service with distributed locking and vote validation
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

/**
 * Reset Voter's Vote Status (Admin Only)
 * 
 * REQUEST FLOW:
 * 1. Extract JWT token from Authorization header to identify admin
 * 2. Parse username from request body (target voter to reset)
 * 3. Verify admin role in service layer
 * 4. Reset voter's isVoted flag to false
 * 5. Delete all vote records associated with the voter
 * 6. Log admin action for audit trail
 * 7. Return success response
 * 
 * ⚠️ SECURITY CONSIDERATIONS:
 * - Authentication enforced by getPayload() - throws 401 if token invalid
 * - Authorization verified in voterResetVote service (admin role check)
 * - Audit logging captures: admin username, admin ID, target username, target ID
 * - No rate limiting - malicious admin could reset votes in bulk
 * - No confirmation/approval workflow - single API call immediately resets vote
 * - No notification to affected voter that their vote was reset
 * 
 * AUDIT TRAIL:
 * - All reset actions logged to file via fileLogger
 * - Log format: "Admin {username} ({id}) reset vote for user {username} ({id})"
 * - Useful for detecting abuse or investigating disputed elections
 * 
 * USE CASES:
 * - Voter made mistake and requests re-vote
 * - Technical issue caused double-vote state
 * - Admin testing or troubleshooting
 * 
 * ABUSE POTENTIAL:
 * - Malicious admin could reset votes to change election outcome
 * - Implement additional safeguards: require justification, multi-admin approval
 * 
 * @param req.body.username - Username of voter to reset
 * @param req.headers.authorization - JWT token containing admin ID
 * @returns 200 - Vote status successfully reset
 * @throws 401 - Invalid/missing token, or user not found
 * @throws 403 - Non-admin attempting to reset vote
 */
export const resetVote = asyncHandler(async (req, res) => {
  // Take the payload
  const { username } = req.body;
  
  // ⚠️ SECURITY: Extract admin ID from JWT for authorization and audit logging
  const { id } = getPayload(req);

  // calls the service with adminId for role verification and audit trail
  await voterResetVote(username, id);

    res.status(200).json({
      status: "success",
      message: "user vote status resetted",
    });
});

/**
 * Get Voter Statistics - Count of Voted vs Not-Voted
 * 
 * REQUEST FLOW:
 * 1. Service queries User collection aggregating by isVoted field
 * 2. Returns count of voters who voted (isVoted: true) and haven't (isVoted: false)
 * 3. Return aggregated statistics
 * 
 * RESPONSE FORMAT:
 * [
 *   { _id: true, count: 150 },   // 150 voters have voted
 *   { _id: false, count: 50 }    // 50 voters haven't voted
 * ]
 * 
 * ⚠️ SECURITY CONSIDERATIONS:
 * - No authentication required - publicly accessible endpoint
 * - Leaks voter turnout information (may be sensitive during active voting)
 * - No PII exposed (only aggregate counts)
 * - Consider adding authentication if turnout data should be restricted
 * 
 * USE CASES:
 * - Admin dashboard displaying real-time voter participation
 * - Public voting progress indicator
 * - Determining if quorum has been reached
 * 
 * @returns 200 - Voter count statistics
 * @throws 500 - Database aggregation failure
 */
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

/**
 * Get Live Vote Count Results for OSIS and MPK
 * 
 * REQUEST FLOW:
 * 1. Query Vote collection for OSIS label, aggregate by candidate
 * 2. Query Vote collection for MPK label, aggregate by candidate
 * 3. Parallel execution via Promise.all (voterGetResult called twice)
 * 4. Return combined results with vote counts per candidate
 * 
 * RESPONSE FORMAT:
 * {
 *   data: {
 *     osis: [
 *       { name: "Candidate A", number: 1, count: 45 },
 *       { name: "Candidate B", number: 2, count: 38 }
 *     ],
 *     mpk: [
 *       { name: "Candidate X", number: 1, count: 50 },
 *       { name: "Candidate Y", number: 2, count: 33 }
 *     ]
 *   }
 * }
 * 
 * ⚠️ SECURITY CONSIDERATIONS:
 * - No authentication required - publicly accessible endpoint
 * - Exposes real-time voting results (could influence voter behavior)
 * - Consider restricting access during active voting period to prevent bias
 * - Results are sorted by candidate number, not by vote count (no ranking leak)
 * - No rate limiting - could be abused for DoS via repeated aggregation queries
 * 
 * PERFORMANCE:
 * - Two MongoDB aggregations with $lookup (JOIN) operations
 * - Can be expensive on large datasets (consider caching or indexing)
 * - Results are calculated on-demand (not cached)
 * 
 * USE CASES:
 * - Admin monitoring dashboard
 * - Public results page after voting closes
 * - Real-time election tracking (if allowed by election rules)
 * 
 * TRIGGERED BY:
 * - Frontend polls this endpoint after receiving Pusher notification from voterPushLiveCount
 * - Pusher sends empty payload "", frontend then fetches full data here
 * 
 * @returns 200 - Live vote counts for all candidates
 * @throws 500 - Database aggregation failure
 */
export const getLiveCount = asyncHandler(async (req, res) => {
  // Parallel aggregation queries for both OSIS and MPK vote counts
  const result = {
    osis: await voterGetResult("osis"),
    mpk: await voterGetResult("mpk"),
  };

  res.status(200).json({
    "data": result,
  })
})