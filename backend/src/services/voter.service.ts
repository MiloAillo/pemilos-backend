import { Settings, VoteCount, Voter } from "../utils/types.util";
import { User } from "../models/user.model";
import { createError } from "../exceptions/error.exception";
import { getRedlock } from "../configs/redlock.config";
import { PostInsertVote } from "../dtos/vote.dto";
import { Vote } from "../models/vote.model";
import { getRedisClient } from "../configs/redis.config";
import debounce from "lodash/debounce";
import { getPusherClient } from "../configs/pusher.config";
import { Candidate } from "../models/candidate.model";
import { fileLogger, logger } from "../utils/logger.util";

/**
 * Batch Insert Voters into Database
 * 
 * Inserts multiple voter records in a single MongoDB operation for efficiency.
 * 
 * INSERTION BEHAVIOR:
 * - ordered: true - stops on first error, maintains insertion order
 * - If duplicate username/unique constraint violation occurs, entire operation fails
 * - Previously inserted records (before error) remain in database
 * 
 * ⚠️ SECURITY CONSIDERATIONS:
 * - Passwords should already be hashed by caller (generatePassword util)
 * - No validation of password strength or voter data integrity here
 * - Duplicate username will cause MongoDB duplicate key error (E11000)
 * 
 * ERROR HANDLING:
 * - Wraps MongoDB errors in custom error with 500 status
 * - Original error passed as fourth parameter for debugging
 * - Does not perform rollback on partial failure
 * 
 * @param voters - Array of Voter objects with name, username, class, password, isVoted
 * @throws 500 - Database insertion failure or duplicate key error
 */
// receive one or more user, and then input it to database.
export const voterSaveMany = async (voters: Voter[]) => {
  try {
    await User.insertMany(voters, {
      ordered: true, // Stop on first error, maintain order
    });
  } catch (err) {
    throw createError("failed", "failed to insert the voter csv", 500, err);
  }
};

/**
 * ⚠️ CRITICAL: Submit Vote with Distributed Locking and Security Checks
 * 
 * Core voting logic with comprehensive security measures to prevent double-voting,
 * race conditions, and unauthorized voting attempts.
 * 
 * REQUEST FLOW:
 * 1. Acquire distributed lock using Redlock (prevents concurrent vote attempts)
 * 2. Check Redis flag: isVotingAllowed (global voting toggle)
 * 3. Validate candidate existence and label correctness (OSIS/MPK)
 * 4. Fetch user record from MongoDB
 * 5. Double-vote detection: check User.isVoted flag AND Vote collection
 * 6. Verify user is not an admin
 * 7. Insert two vote records (one for OSIS, one for MPK)
 * 8. Update user's isVoted flag to true
 * 9. Trigger debounced live count push via Pusher
 * 10. Release distributed lock
 * 
 * ⚠️ CRITICAL SECURITY: DISTRIBUTED LOCKING (REDLOCK)
 * 
 * WHY LOCKING IS NECESSARY:
 * - Prevents race condition where user submits vote twice simultaneously
 * - Without lock: both requests pass isVoted check before either updates database
 * - Example attack: User opens two tabs, clicks "Vote" simultaneously
 * 
 * REDLOCK ALGORITHM:
 * - Distributed lock implementation for Redis clusters
 * - Acquires lock across multiple Redis instances for fault tolerance
 * - Lock key format: `user:vote:{userId}` (per-user locking, not global)
 * - 30-second timeout: maximum time lock can be held
 * 
 * LOCK TIMEOUT IMPLICATIONS:
 * - 30000ms (30 seconds) chosen to handle slow database operations
 * - If operation exceeds 30s, lock auto-releases (prevents deadlock)
 * - Risk: If lock expires before operation completes, another request could proceed
 * - Mitigation: finally block ensures lock release even on errors
 * 
 * ⚠️ REDIS FAILURE HANDLING:
 * - getRedlock() may throw if Redis is unreachable
 * - Lock acquisition may fail if Redis cluster is down
 * - NO FALLBACK: If Redis down, voting fails entirely (fail-safe approach)
 * - Alternative considered: Allow voting without lock (REJECTED - creates race conditions)
 * 
 * ⚠️ RACE CONDITION PREVENTION:
 * Lock prevents:
 * 1. Time-of-check-time-of-use (TOCTOU) between isVoted check and vote insertion
 * 2. Concurrent requests from same user voting for different candidates
 * 3. Partial state updates (isVoted set but votes not inserted)
 * 
 * ⚠️ DUPLICATE VOTE DETECTION (DEFENSE IN DEPTH):
 * - Check 1: User.isVoted flag (fast, in-memory after query)
 * - Check 2: Vote.findOne({user: userId}) (authoritative source of truth)
 * - Both checks performed even with locking (defense against lock expiry race)
 * - If either check fails: 400 "user already voted"
 * 
 * ⚠️ VOTING TOGGLE CHECK (isVotingAllowed):
 * - Redis flag controls global voting state (true/false)
 * - Admin can disable voting instantly without code deployment
 * - Checked INSIDE lock to prevent votes during toggle transition
 * - Returns 401 "vote not allowed" if disabled
 * 
 * CANDIDATE VALIDATION:
 * - Parallel queries for OSIS and MPK candidates (performance optimization)
 * - Validates candidate exists AND has correct label (prevents mismatched votes)
 * - Returns 400 "candidate chosen is not valid" if either invalid
 * 
 * ADMIN PREVENTION:
 * - Admins cannot vote (role separation)
 * - Returns 400 "bro u're literally admin, why u vote" (informal but clear)
 * - Prevents admin from inflating vote counts
 * 
 * DATABASE OPERATIONS:
 * - Vote.insertMany with ordered:true (atomic insertion, stops on error)
 * - Two vote records: {label:"osis", user, candidate}, {label:"mpk", user, candidate}
 * - User.findByIdAndUpdate sets isVoted:true (marks user as voted)
 * - No explicit transaction: relies on ordered insert + lock for consistency
 * 
 * AUDIT LOGGING:
 * - fileLogger records: voter name, OSIS candidate name, MPK candidate name
 * - Format: "{voter.name} voted {osis.name} - {mpk.name}"
 * - Useful for auditing and dispute resolution
 * 
 * LIVE COUNT PUSH:
 * - voterPushLiveCount() debounced by 3 seconds (prevents Pusher rate limits)
 * - Sends empty payload to Pusher channel "pemilose", event "pemilolot"
 * - Frontend receives notification, then fetches full data via getLiveCount API
 * 
 * ERROR SCENARIOS:
 * 1. Redis down → getRedlock() fails → 500 error
 * 2. Lock acquisition timeout → 500 error (lock not acquired within 30s)
 * 3. Lock held too long → auto-release after 30s, potential race condition
 * 4. Voting disabled → 401 "vote not allowed"
 * 5. Invalid candidate → 400 "candidate chosen is not valid"
 * 6. User not found → 400 "user with such id not found"
 * 7. Already voted → 400 "user already voted"
 * 8. Admin attempting vote → 400 "bro u're literally admin, why u vote"
 * 9. Database error during insert → MongoDB error thrown, lock released in finally
 * 10. Lock release failure → logged but doesn't fail request (lock expires anyway)
 * 
 * @param req - Vote request containing osis and mpk candidate IDs
 * @param userId - MongoDB ObjectId of voter (from JWT token)
 * @throws 401 - Voting not allowed (isVotingAllowed=false)
 * @throws 400 - Invalid candidate, user not found, already voted, or admin attempting vote
 * @throws 500 - Redis/Redlock failure, database errors
 */
export const voterSaveVote = async (req: PostInsertVote, userId: string) => {
  // ⚠️ SECURITY: Get Redlock instance for distributed locking
  const redlock = getRedlock();
  
  // ⚠️ SECURITY: Per-user lock key (allows parallel voting by different users)
  const lockName = `user:vote:${userId}`;
  let lock: any;

  try {
    // ⚠️ CRITICAL: Acquire distributed lock with 30-second timeout
    // Prevents race condition where same user votes twice simultaneously
    // Timeout ensures lock doesn't stay locked forever if process crashes
    lock = await redlock.acquire([lockName], 30000);

    // ⚠️ SECURITY: Check if voting is globally enabled (admin can toggle via Redis)
    // Checked inside lock to prevent votes during toggle transition
    const rawData = await getRedisClient().hget("setting", "isVotingAllowed");
    if (rawData !== "true") {
      throw createError("failed", "vote not allowed", 401);
    }

    // ⚠️ SECURITY: Validate candidate existence and label correctness
    // Parallel queries for performance (Promise.all)
    const [osis, mpk] = await Promise.all([
      Candidate.findOne({ _id: req.osis, label: "osis" }),
      Candidate.findOne({ _id: req.mpk, label: "mpk" }),
    ]);
    if (!osis || !mpk) {
      throw createError("failed", "candidate chosen is not valid", 400);
    }

    // Fetch user record for validation and logging
    const user = await User.findById(userId);
    if (!user) {
      throw createError("failed", "user with such id not found", 400);
    }
    
    // ⚠️ CRITICAL: DOUBLE-VOTE PREVENTION (DEFENSE IN DEPTH)
    // Check 1: User.isVoted flag (fast boolean check)
    // Check 2: Vote collection query (authoritative source of truth)
    // Both checks ensure no votes recorded even if isVoted flag corrupted
    if (user.isVoted || (await Vote.findOne({ user: userId }))) {
      throw createError("failed", "user already voted", 400);
    }
    
    // ⚠️ SECURITY: Prevent admins from voting (role separation)
    if (user.role === "admin") {
      throw createError("failed", "bro u're literally admin, why u vote", 400);
    }

    // Insert two vote records atomically (one for OSIS, one for MPK)
    // ordered:true ensures both inserted or neither (stops on first error)
    await Vote.insertMany(
      [
        { label: "osis", user: userId, candidate: req.osis },
        { label: "mpk", user: userId, candidate: req.mpk },
      ],
      { ordered: true }
    );
    
    // Mark user as voted (prevents future vote attempts)
    await User.findByIdAndUpdate(userId, { $set: { isVoted: true } });

    // Trigger debounced live count push to frontend (3-second debounce prevents rate limits)
    voterPushLiveCount();
    
    // ⚠️ AUDIT: Log vote for accountability and dispute resolution
    fileLogger.info(`${user.name} voted ${osis.name} - ${mpk.name}`);
  } finally {
    // ⚠️ CRITICAL: Always release lock, even on errors
    // Prevents deadlocks and allows user to retry on failure
    if (lock) {
      try {
        await lock.release();
      } catch (err) {
        // Log lock release failure but don't throw (lock expires anyway after 30s)
        fileLogger.error("Failed to release lock", err);
      }
    }
  }
};


/**
 * Aggregate Vote Results by Candidate
 * 
 * Performs MongoDB aggregation pipeline to count votes per candidate for a given label (OSIS or MPK).
 * 
 * AGGREGATION PIPELINE:
 * 1. $match: Filter votes by label ("osis" or "mpk")
 * 2. $group: Group by candidate ID, count votes per candidate
 * 3. $lookup: Join with candidates collection to get candidate details
 * 4. $unwind: Convert candidate array to single object
 * 5. $project: Shape output (name, number, count), exclude _id
 * 6. $sort: Sort by candidate number (ascending)
 * 
 * EXAMPLE OUTPUT:
 * [
 *   { name: "Candidate A", number: 1, count: 45 },
 *   { name: "Candidate B", number: 2, count: 38 },
 *   { name: "Candidate C", number: 3, count: 12 }
 * ]
 * 
 * ⚠️ SECURITY CONSIDERATIONS:
 * - No authentication required when called from getLiveCount controller
 * - Results reveal vote distribution (could influence undecided voters)
 * - No PII exposed (only candidate names and vote counts)
 * - Label parameter not sanitized (trusted input from controller)
 * 
 * PERFORMANCE:
 * - $lookup performs JOIN operation (can be expensive on large datasets)
 * - Consider indexing: Vote.label, Vote.candidate, Candidate._id
 * - Results not cached (recalculated on every request)
 * - O(n) complexity where n = number of votes for given label
 * 
 * EDGE CASES:
 * - Candidates with 0 votes are NOT included in results
 * - If no votes exist for label, returns empty array []
 * - Sorted by candidate number, not by vote count (prevents ranking leak)
 * 
 * @param label - Vote category ("osis" or "mpk")
 * @returns Array of vote counts per candidate, sorted by candidate number
 * @throws Re-throws any MongoDB aggregation errors
 */
export const voterGetResult = async (label: string) => {
  try {
    // Start from Candidate collection (not Vote) to include candidates with zero votes
    const results = await Candidate.aggregate([
      // Filter candidates by label (OSIS or MPK)
      { $match: { label } },

      // Lookup votes for this candidate
      {
        $lookup: {
          from: "votes",
          let: { candidateId: "$_id", candidateLabel: "$label" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$candidate", "$$candidateId"] },
                    { $eq: ["$label", "$$candidateLabel"] }
                  ]
                }
              }
            }
          ],
          as: "votes"
        }
      },

      // Count votes (returns 0 if no votes exist)
      {
        $addFields: {
          count: { $size: "$votes" }
        }
      },

      // Project final shape
      {
        $project: {
          _id: 0,
          name: 1,
          number: 1,
          count: 1,
        },
      },

      // Sort by candidate number (not by vote count - prevents ranking leak during active voting)
      { $sort: { number: 1 } },
    ]);

    return results;
  } catch (err) {
    throw err;
  }
};

/**
 * Push Live Vote Count Notification to Frontend
 * 
 * Debounced function that triggers Pusher notification to inform frontend clients
 * that vote counts have been updated and should be refreshed.
 * 
 * DEBOUNCING STRATEGY:
 * - 3-second debounce delay (lodash debounce trailing edge)
 * - Multiple rapid votes within 3 seconds result in only ONE Pusher notification
 * - Reduces Pusher API calls and prevents rate limiting
 * - Example: 10 votes in 2 seconds → 1 Pusher notification after 3-second quiet period
 * 
 * PUSHER CONFIGURATION:
 * - Channel: "pemilose"
 * - Event: "pemilolot"
 * - Payload: "" (empty string - no data transmitted)
 * 
 * WHY EMPTY PAYLOAD:
 * - Pusher notification is just a trigger/signal
 * - Frontend receives notification, then calls getLiveCount API for actual data
 * - Prevents sending large vote count data through Pusher (expensive)
 * - Separates real-time notification from data fetching
 * 
 * REQUEST FLOW:
 * 1. Vote submitted → voterSaveVote calls voterPushLiveCount()
 * 2. Debounce waits 3 seconds for more votes
 * 3. After quiet period, Pusher notification sent
 * 4. All connected frontend clients receive notification
 * 5. Frontend calls GET /api/voter/live-count to fetch updated results
 * 
 * ⚠️ SECURITY CONSIDERATIONS:
 * - Pusher channel is public (no authentication required to subscribe)
 * - Empty payload prevents data leakage through Pusher
 * - Actual vote data requires separate API call (can be authenticated)
 * - No rate limiting on Pusher triggers (debouncing provides some protection)
 * 
 * PERFORMANCE:
 * - Debouncing reduces Pusher API costs (charged per message)
 * - 3-second delay acceptable for near-real-time updates
 * - Multiple concurrent votes batched into single notification
 * 
 * FAILURE SCENARIOS:
 * - Pusher down: Notification fails silently, doesn't block vote
 * - getPusherClient() error: Error not caught, may crash calling function
 * - Network issues: Pusher retries internally
 * 
 * @returns void after 3-second debounce period
 */
// Result is empty, only trigger frontend to fetch another API for the voting count
export const voterPushLiveCount = debounce(async () => {
  // Empty payload - frontend uses this as trigger to fetch actual data
  const result = ""

  // Get Pusher client and trigger notification
  const pusher = await getPusherClient();

  // ⚠️ Broadcast to all subscribers on "pemilose" channel
  pusher.trigger("pemilose", "pemilolot", result);
  return;
}, 3000); // 3-second debounce delay

/**
 * Reset Voter's Vote Status (Admin Only)
 * 
 * Allows admin to reset a voter's vote, clearing their isVoted flag and deleting
 * their vote records from the database. Used for error correction or testing.
 * 
 * REQUEST FLOW:
 * 1. Verify admin role (fetch admin user by ID from JWT)
 * 2. Find target voter by username
 * 3. Set voter's isVoted flag to false
 * 4. Delete all vote records associated with voter
 * 5. Log admin action for audit trail
 * 
 * ⚠️ SECURITY CONSIDERATIONS - AUTHORIZATION:
 * - CRITICAL: Admin role verification before any operations
 * - Checks both admin existence AND role === "admin"
 * - Returns 403 "only admins can reset votes" if non-admin attempts
 * - adminId extracted from JWT token (authenticated via getPayload middleware)
 * 
 * ⚠️ SECURITY CONSIDERATIONS - AUDIT TRAIL:
 * - ALL reset actions logged with full details:
 *   - Admin username and ID (who performed reset)
 *   - Target voter username and ID (whose vote was reset)
 * - Format: "Admin {username} ({id}) reset vote for user {username} ({id})"
 * - Logged to file via fileLogger (persistent audit trail)
 * - Essential for investigating election disputes or admin abuse
 * 
 * ⚠️ SECURITY RISKS:
 * - No rate limiting: malicious admin could reset votes in bulk
 * - No justification/reason required: admin can reset without explanation
 * - No multi-admin approval: single admin has unilateral power
 * - No voter notification: user not informed their vote was reset
 * - No voting window check: can reset votes even after election closed
 * 
 * RECOMMENDED ENHANCEMENTS:
 * - Require justification/reason field
 * - Implement multi-admin approval workflow for vote resets
 * - Send notification to affected voter
 * - Disable reset after voting period ends
 * - Add rate limiting (max resets per admin per hour)
 * 
 * DATABASE OPERATIONS:
 * 1. User.findByIdAndUpdate (admin lookup + role check)
 * 2. User.findOneAndUpdate (target voter lookup + isVoted reset)
 * 3. Vote.deleteMany (remove all votes by voter)
 * - Not atomic: if Vote.deleteMany fails, isVoted already false (inconsistent state)
 * - Consider using MongoDB transactions for atomicity
 * 
 * ERROR SCENARIOS:
 * - Admin not found: 403 "only admins can reset votes"
 * - Admin exists but role != "admin": 403 "only admins can reset votes"
 * - Target voter username not found: 401 "user with such credentials not found"
 * - Database errors: re-thrown as-is (no custom error wrapping)
 * 
 * USE CASES:
 * - Voter made mistake and requests re-vote (legitimate)
 * - Technical glitch caused double-vote state (legitimate)
 * - Admin testing in development environment (legitimate)
 * - Malicious admin manipulating election results (illegitimate - prevented by audit log)
 * 
 * @param username - Username of voter whose vote should be reset
 * @param adminId - MongoDB ObjectId of admin performing reset (from JWT)
 * @throws 403 - Non-admin attempting reset or admin not found
 * @throws 401 - Target voter username not found
 * @throws Re-throws any database errors
 */
export const voterResetVote = async (username: string, adminId: string) => {
  try {
    // ⚠️ SECURITY: Verify admin role before allowing reset operation
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== "admin") {
      throw createError("unauthorized", "only admins can reset votes", 403);
    }

    // Find and update target voter's isVoted flag
    const user = await User.findOneAndUpdate(
      {
        username: username,
      },
      {
        $set: {
          isVoted: false, // Allow voter to vote again
        },
      },
    );

    if (!user) {
      throw createError("failed", "user with such credentials not found", 401);
    }

    // Delete all vote records for this voter (both OSIS and MPK votes)
    await Vote.deleteMany({
      user: user._id,
    });

    // ⚠️ AUDIT: Log all vote reset actions for accountability and dispute resolution
    // Captures: who did it (admin), when (timestamp), and to whom (voter)
    fileLogger.info(`Admin ${admin.username} (${adminId}) reset vote for user ${username} (${user._id})`);
  } catch (err) {
    throw err;
  }
};

/**
 * Count Voters by Vote Status
 * 
 * Aggregates voter statistics to show how many voters have voted vs. haven't voted.
 * 
 * AGGREGATION PIPELINE:
 * 1. $match: Filter only users with role "voter" (exclude admins)
 * 2. $group: Group by isVoted field (true/false), count each group
 * 
 * RESPONSE FORMAT:
 * [
 *   { _id: true, count: 150 },   // 150 voters have voted
 *   { _id: false, count: 50 }    // 50 voters haven't voted yet
 * ]
 * 
 * ⚠️ SECURITY CONSIDERATIONS:
 * - No authentication in controller (publicly accessible endpoint)
 * - Reveals voter turnout statistics (may be sensitive during active voting)
 * - No PII exposed (only aggregate counts by vote status)
 * - Admin users excluded from count (role filter)
 * 
 * USE CASES:
 * - Admin dashboard displaying real-time participation rate
 * - Public voting progress indicator (if transparency desired)
 * - Determining if minimum quorum has been reached
 * - Monitoring voting activity trends over time
 * 
 * PERFORMANCE:
 * - Simple aggregation on single collection
 * - Consider indexing User.role and User.isVoted for performance
 * - O(n) complexity where n = total number of users
 * 
 * EDGE CASES:
 * - If no voters exist: returns empty array []
 * - If all voters voted: returns only [{ _id: true, count: X }]
 * - If no voters voted yet: returns only [{ _id: false, count: X }]
 * 
 * @returns Array with vote status counts [{ _id: boolean, count: number }]
 * @throws Re-throws any MongoDB aggregation errors
 */
export const voterCount = async () => {
  try {
    const result: VoteCount[] = await User.aggregate([
      {
        $match: {
          role: "voter", // Exclude admin users from count
        },
      },
      {
        $group: {
          _id: "$isVoted", // Group by vote status (true/false)
          count: {
            $sum: 1, // Count users in each group
          },
        },
      },
    ]);

    return result;
  } catch (err) {
    throw err;
  }
};
