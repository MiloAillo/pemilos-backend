import mongoose, { model, Schema } from "mongoose";
import { LABEL } from "../utils/variables.util";

/* 

To make a field related with another document,
you can use type: "Schema.Types.ObjectId" and a "ref".

ObjectId is a Mongoose exclusive DataType where it can be recognized as an _id.
When we cast the function .populate() to this model, this field will turn into the owner of the _id or the referred document.

*/

/**
 * Vote Schema
 * 
 * Represents a single vote cast by a user for a candidate in a specific election category.
 * This is the transactional record that enforces "one vote per user per category" rule.
 * 
 * Business Context:
 * - Each user can vote once for OSIS and once for MPK (two separate Vote documents)
 * - Votes are immutable after creation (no updates/deletes allowed)
 * - Relationship: User (1) → (many) Votes, Candidate (1) → (many) Votes
 * 
 * Data Integrity:
 * - Compound unique index ensures one vote per user per label
 * - Foreign key references maintain referential integrity
 * - Timestamps provide audit trail for vote timing
 */
const voteSchema = new Schema({
      /**
       * Label (Election Category)
       * 
       * Identifies which election this vote belongs to.
       * 
       * Business Logic:
       * - LABEL = ["OSIS", "MPK"] (defined in variables.util)
       * - Users must vote separately for each category
       * - Results are tallied per label
       * 
       * Validation: Enum ensures only valid election types
       * 
       * Index Component: Part of compound unique index (user + label)
       * - Prevents user from voting twice in same category
       * - Allows user to vote once per category
       */
      label: {
           type: String,
           required: true,
           enum: LABEL, // Restricts to predefined election categories
      },

      /**
       * User (Voter Reference)
       * 
       * Foreign key to User collection - identifies who cast this vote.
       * 
       * Relationship: Many-to-One (Vote → User)
       * - Multiple votes can belong to one user (one per label)
       * - Use .populate('user') to fetch full user details in queries
       * 
       * Business Rules:
       * - Only users with role="voter" should cast votes (enforced in auth middleware)
       * - User must exist and be authenticated
       * 
       * Data Integrity:
       * - ObjectId reference ensures vote links to valid user
       * - No cascading delete: votes persist even if user deleted (audit trail)
       * 
       * Query Patterns:
       * - Vote.find({ user: userId }) - Get all votes by user
       * - Vote.find({ user: userId, label: "OSIS" }) - Check if user voted in OSIS
       * 
       * Index Component: Part of compound unique index (user + label)
       */
      user: {
           // The objectId type, the reason why it can be treated as an _id when saving a document.
           type: Schema.Types.ObjectId,
           // Fill the referred Model.
           ref: "User",
           required: true,
      },
      
      /**
       * Candidate (Vote Choice Reference)
       * 
       * Foreign key to Candidate collection - identifies who received this vote.
       * 
       * Relationship: Many-to-One (Vote → Candidate)
       * - Multiple votes can point to one candidate
       * - Use .populate('candidate') to fetch candidate details (name, image, number)
       * 
       * Business Rules:
       * - Candidate must match the same label as the vote
       *   Example: If label="OSIS", candidate must have label="OSIS"
       *   (This validation should be enforced in service layer before save)
       * 
       * Data Integrity:
       * - ObjectId reference ensures vote links to valid candidate
       * - No cascading delete: votes persist for audit even if candidate removed
       * 
       * Query Patterns:
       * - Vote.countDocuments({ candidate: candidateId }) - Tally votes per candidate
       * - Vote.find({ label: "OSIS" }).populate('candidate') - Get all OSIS votes with details
       * 
       * Performance: Consider indexing for vote counting queries
       */
      candidate: {
           type: Schema.Types.ObjectId,
           ref: "Candidate",
           required: true,
      }
}, { 
      /**
       * Timestamps: { createdAt, updatedAt }
       * 
       * Automatically managed by Mongoose.
       * 
       * Business Value:
       * - createdAt: Exact time vote was cast (audit trail, election timeline)
       * - updatedAt: Should equal createdAt (votes are immutable)
       * 
       * Security & Compliance:
       * - Immutable timestamp proves when vote occurred
       * - Useful for detecting voting patterns or system issues
       * - Can verify votes were cast during official election period
       * 
       * Analytics:
       * - Track voting velocity over time
       * - Identify peak voting hours
       * - Generate "Votes per hour" charts
       */
      timestamps: true 
})

/**
 * Compound Unique Index: (user + label)
 * 
 * Critical Data Integrity Constraint
 * ===================================
 * 
 * Purpose: Enforce "one vote per user per election category" rule
 * 
 * How It Works:
 * - MongoDB creates a unique B-tree index on the combination of (user, label)
 * - Duplicate insert with same (user, label) pair throws E11000 duplicate key error
 * - Different labels allow same user to vote multiple times
 * 
 * Examples:
 * ✅ Allowed:
 *    { user: "user123", label: "OSIS", candidate: "candidate1" }
 *    { user: "user123", label: "MPK", candidate: "candidate2" }
 * 
 * ❌ Rejected (E11000 error):
 *    { user: "user123", label: "OSIS", candidate: "candidate1" }
 *    { user: "user123", label: "OSIS", candidate: "candidate3" } // Duplicate!
 * 
 * Performance Benefits:
 * - O(log n) lookup for duplicate detection (faster than application-level check)
 * - Index used for queries: Vote.find({ user: X, label: Y })
 * - Supports efficient "has user voted in this category?" checks
 * 
 * Error Handling:
 * - Application should catch MongoError code 11000
 * - Return user-friendly message: "You have already voted in this category"
 * 
 * Index Order: { user: 1, label: 1 }
 * - user first: Supports queries filtering by user alone
 * - label second: Supports queries filtering by (user + label)
 * - Does NOT support label-only queries efficiently (would need separate index)
 * 
 * Alternative Design (Not Used):
 * - Could use single Vote document with array of {label, candidate} pairs per user
 * - Rejected because: harder to validate, complex updates, less atomic
 * 
 * Security Implication:
 * - Database-level enforcement prevents race conditions
 * - Even if two requests arrive simultaneously, only one will succeed
 * - Protects against double-voting via rapid button clicks or API replay attacks
 */
voteSchema.index({ user: 1, label: 1 }, { unique: true })

export const Vote = model("Vote", voteSchema)