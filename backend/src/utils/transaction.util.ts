/**
 * MongoDB Transaction Utility
 * 
 * PURPOSE:
 * Provides reusable transaction wrapper for multi-document operations requiring atomicity.
 * Ensures all database operations succeed together or fail together (ACID compliance).
 * 
 * ATOMICITY:
 * Transactions guarantee that a series of database operations are treated as a single unit:
 * - All operations succeed → transaction commits (changes are permanent)
 * - Any operation fails → transaction aborts (all changes are rolled back)
 * 
 * WHEN TO USE:
 * Use transactions when multiple database writes must succeed together:
 * - Transferring votes between candidates (decrement old, increment new)
 * - Creating user with related records (user + profile + permissions)
 * - Bulk operations where partial success is unacceptable
 * - Financial operations (credits, debits, transfers)
 * 
 * WHEN NOT TO USE:
 * - Single document updates (MongoDB provides document-level atomicity)
 * - Read-only operations (no need for transaction overhead)
 * - High-frequency writes (transactions have performance cost)
 * - Operations across multiple databases (transactions are single-DB only)
 * 
 * MONGODB REPLICA SET REQUIREMENT:
 * ⚠️ CRITICAL: Transactions ONLY work with MongoDB replica sets
 * - Standalone MongoDB instances do not support transactions
 * - Minimum replica set: 1 primary + 1 secondary (or 1 primary + 1 arbiter)
 * - Production: Recommended 1 primary + 2 secondaries for high availability
 * 
 * CURRENT STATUS:
 * 🔴 CURRENTLY UNUSED - MongoDB replica set not yet configured
 * 🔧 TODO: Set up replica set before using this utility
 * 
 * SETUP INSTRUCTIONS:
 * 1. Convert standalone MongoDB to replica set:
 *    - Add `replSetName: "rs0"` to mongod.conf
 *    - Run: rs.initiate() in mongo shell
 * 2. For local development, single-node replica set is acceptable
 * 3. For production, deploy 3-node replica set for redundancy
 * 
 * INTEGRATION:
 * Import and wrap service logic that requires transactional guarantees:
 * 
 * @example
 *   await execWithTransaction(async (session) => {
 *     await User.create([{ username: 'test' }], { session });
 *     await Profile.create([{ userId: 'test' }], { session });
 *     // Both succeed or both fail
 *   });
 * 
 * PERFORMANCE CONSIDERATIONS:
 * - Transactions have ~10-30% overhead vs non-transactional writes
 * - Hold locks on documents (can cause contention under high load)
 * - Timeout after 60 seconds by default (configurable)
 * - Avoid long-running operations inside transactions
 * 
 * SECURITY IMPLICATIONS:
 * - Transaction isolation prevents dirty reads between concurrent operations
 * - Rollback prevents partial state that could violate business rules
 * - Audit logs should capture transaction boundaries (start, commit, abort)
 */

import mongoose, {ClientSession} from "mongoose";

/**
 * Execute database operations within a MongoDB transaction
 * 
 * BEHAVIOR:
 * 1. Starts a new MongoDB session
 * 2. Wraps provided function with automatic transaction management
 * 3. Commits transaction if function succeeds
 * 4. Aborts transaction (rollback) if function throws error
 * 5. Always closes session (prevents memory leaks)
 * 
 * MONGODB SESSION LIFECYCLE:
 * - Session: Logical grouping of operations (required for transactions)
 * - Transaction: ACID-compliant unit of work within a session
 * - withTransaction(): Automatic retry logic + commit/abort handling
 * 
 * AUTOMATIC RETRY LOGIC:
 * MongoDB's withTransaction() automatically retries on transient errors:
 * - TransientTransactionError: Network blips, replica failover
 * - UnknownTransactionCommitResult: Commit status uncertain
 * - Retries up to 120 seconds by default (configurable)
 * 
 * ERROR HANDLING:
 * - Transient errors: Automatically retried by withTransaction()
 * - Application errors: Transaction aborted, error propagated to caller
 * - Timeout errors: Transaction aborted after 60 seconds
 * - Network errors: Session may be unusable, always cleaned up in finally block
 * 
 * SESSION CLEANUP:
 * - CRITICAL: Always call endSession() to prevent memory leaks
 * - Uses finally block to ensure cleanup even on errors
 * - TypeScript lacks defer/RAII, so finally is the idiom
 * 
 * @param func - Async function containing transactional database operations
 *               Must accept ClientSession parameter and pass to all db operations
 * @returns Promise resolving to func's return value (if any)
 * @throws Any error thrown by func (after transaction abort)
 * 
 * @example
 *   // Transfer vote between candidates (atomic)
 *   await execWithTransaction(async (session) => {
 *     await Candidate.updateOne(
 *       { _id: oldCandidateId },
 *       { $inc: { voteCount: -1 } },
 *       { session }
 *     );
 *     await Candidate.updateOne(
 *       { _id: newCandidateId },
 *       { $inc: { voteCount: 1 } },
 *       { session }
 *     );
 *     await Vote.updateOne(
 *       { userId },
 *       { candidateId: newCandidateId },
 *       { session }
 *     );
 *     // All three operations commit together or roll back together
 *   });
 * 
 * @example
 *   // Create user with related records (atomic)
 *   const userId = await execWithTransaction(async (session) => {
 *     const user = await User.create([{ username, email }], { session });
 *     await Profile.create([{ userId: user[0]._id, bio: '' }], { session });
 *     await AuditLog.create([{ action: 'user_created', userId: user[0]._id }], { session });
 *     return user[0]._id;
 *   });
 * 
 * @example
 *   // Transaction with error handling
 *   try {
 *     await execWithTransaction(async (session) => {
 *       const vote = await Vote.findOne({ userId }, { session });
 *       if (vote) {
 *         throw new Error('User already voted');
 *       }
 *       await Vote.create([{ userId, candidateId }], { session });
 *     });
 *   } catch (err) {
 *     console.error('Transaction failed:', err.message);
 *     // Transaction was automatically rolled back
 *   }
 * 
 * USAGE NOTES:
 * - Always pass { session } option to ALL db operations inside transaction
 * - Operations without session option will NOT be part of transaction
 * - Mongoose model methods: use { session } in options parameter
 * - Model.create(): Must wrap docs in array when using session
 *   - Correct: Model.create([{ field: 'value' }], { session })
 *   - Incorrect: Model.create({ field: 'value' }, { session })
 * 
 * DEBUGGING:
 * - Enable MongoDB query logging: mongoose.set('debug', true)
 * - Check for operations missing { session } option
 * - Verify replica set status: rs.status() in mongo shell
 * - Monitor transaction metrics in MongoDB logs
 * 
 * PRODUCTION HARDENING:
 * - Set transaction timeout based on expected operation duration
 * - Monitor transaction abort rate (high rate indicates contention)
 * - Implement exponential backoff for transaction retries
 * - Consider read/write concerns for consistency vs performance tradeoff
 * - Use read concern "snapshot" for consistent reads within transaction
 * 
 * REPLICA SET VERIFICATION:
 * Before using this utility, verify replica set is configured:
 * ```
 * const admin = mongoose.connection.db.admin();
 * const status = await admin.command({ replSetGetStatus: 1 });
 * console.log('Replica set:', status.set);
 * ```
 */
export const execWithTransaction = async (
     // Function parameter: accepts session and returns Promise
     // Session must be passed to ALL database operations inside this function
     func: (session: ClientSession) => Promise<void>
) => {
     // Start a new MongoDB session
     // Session is a lightweight object that tracks a logical sequence of operations
     const session = await mongoose.startSession()
     try {
          // withTransaction() provides:
          // 1. Automatic transaction begin
          // 2. Retry logic for transient errors
          // 3. Automatic commit on success
          // 4. Automatic abort on failure
          return await session.withTransaction(async () => {
               // Execute user-provided function with session
               // All operations inside func() should use this session
               return await func(session);
          });
     } catch (error) {
          // Transaction was automatically aborted by withTransaction()
          // Re-throw error for caller to handle
          throw error
     } finally {
          // CRITICAL: Always close session to prevent memory leaks
          // Must use finally block to ensure cleanup even on errors
          // TypeScript doesn't have defer/RAII, so finally is the pattern
          session.endSession()
     }
}