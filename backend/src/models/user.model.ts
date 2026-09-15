import mongoose from "mongoose";
import { CLASS, LABEL } from "../utils/variables.util";
const { Schema, model } = mongoose;

/* 
For those who reads this repo, this is one of Mongoose's basics: Schema and Models

*Collection is basically a Table in MongoDB term.

Schema is a definition of Collection. That's it! Just the "definition". Consisting of SchemaTypes

And then comes a Model, which is an implementation of schema in the database. Model is directly
correlated to the Collection.

so:

Schema -> Model -> Collection
*/

/**
 * User Schema
 * 
 * Represents voters and administrators in the e-voting system.
 * Each user can cast votes for different election categories (OSIS, MPK).
 * 
 * Business Context:
 * - Users authenticate with NISN (username) and password
 * - Voters can participate in multiple election categories
 * - Admins manage candidates and monitor election progress
 * 
 * Security Considerations:
 * - Username (NISN) is unique to prevent duplicate accounts
 * - Password should be hashed before storage (handled in auth logic)
 * - Role-based access control via enum restricts administrative actions
 */
const userSchema = new Schema({
      /**
       * Username (NISN - Nomor Induk Siswa Nasional)
       * 
       * Primary authentication credential for student voters.
       * Must be unique across the system to ensure one account per student.
       * 
       * Database Constraint: Unique index automatically created by Mongoose
       * Performance: Indexed by default due to unique constraint
       */
      username: {
           type: String,
           required: true,
           unique: true // Prevents duplicate accounts, creates unique B-tree index
      },

      /* 
      
      Above, lies an SchemaType. Which is a definition of Field, there is so much thing here.\
      Like type (the field's type of course) and some other attribute like unique, lowercase, etc.

      */

      /**
       * Full Name
       * 
       * Display name for UI and audit trails.
       * Required for voter identification and admin logging.
       */
      name: {
           type: String,
           required: true,
      },

      /**
       * Role (voter | admin)
       * 
       * Authorization level for access control.
       * 
       * Business Logic:
       * - "voter": Can authenticate, view candidates, and cast votes
       * - "admin": Can manage candidates, view results, and access admin dashboard
       * 
       * Security: Enum validation prevents privilege escalation via invalid roles
       * Default: "voter" ensures new accounts don't accidentally gain admin access
       * 
       * Performance: Indexed for fast role-based queries (getUsersByRole)
       */
      role: {
           type: String,
           required: true,
           enum: ["voter", "admin"], // Whitelist validation
           default: "voter" // Principle of least privilege
      },

      /**
       * Class
       * 
       * Student's class identifier (e.g., "10A", "11B", "Staff", "Teacher").
       * Used for voter registration validation and demographic analysis.
       * 
       * Validation: Must match predefined CLASS array to ensure data consistency
       * Business Use: Can be used for class-level voting statistics
       */
      class: {
           type: String,
           required: true,
           enum: CLASS // Validates against allowed class values
      },

      /**
       * Password
       * 
       * Hashed password for authentication.
       * 
       * Security Notes:
       * - MUST be hashed using bcrypt before storage (handled in auth middleware)
       * - Never returned in API responses (use .select('-password') in queries)
       * - Minimum strength requirements enforced at validation layer
       */
      password: {
           type: String,
           required: true,
      },

      /**
       * isVoted (Denormalized Flag)
       * 
       * Indicates whether user has completed voting in ALL categories.
       * 
       * Design Decision: Denormalization vs Normalization Trade-off
       * ----------------------------------------------------------------
       * NORMALIZED APPROACH (Not Used):
       * - Query Vote collection: Vote.countDocuments({ user: userId })
       * - Compare count with LABEL.length to check completion
       * - Pros: Single source of truth, no data duplication
       * - Cons: Requires JOIN (populate) on every user query, slower performance
       * 
       * DENORMALIZED APPROACH (Current):
       * - Store boolean flag directly on User document
       * - Updated when user casts vote (post-save hook or transaction)
       * - Pros: O(1) lookup, faster dashboard queries, no JOIN needed
       * - Cons: Must maintain consistency between User.isVoted and Vote records
       * 
       * Why Denormalization Wins Here:
       * - Dashboard queries "Who has voted?" run frequently
       * - Election day traffic spikes make performance critical
       * - Inconsistency risk is low (votes are write-once, append-only)
       * - Can verify integrity with periodic reconciliation job
       * 
       * Update Strategy:
       * - Set to true when user completes all required votes (OSIS + MPK)
       * - Use transaction to ensure atomicity with Vote insert
       */
      isVoted: {
           type: Boolean,
           required: true,
           default: false // Users start in "not voted" state
      }
}, { 
      /**
       * Timestamps: { createdAt, updatedAt }
       * 
       * Automatically managed by Mongoose.
       * 
       * Business Value:
       * - createdAt: User registration time (audit trail)
       * - updatedAt: Last profile/vote status change (monitoring)
       * 
       * Security: Immutable by user, prevents timestamp manipulation
       * Performance: createdAt useful for "New users today" queries
       */
      timestamps: true 
})

/**
 * Index: role (ascending)
 * 
 * Purpose: Optimize role-based authorization queries
 * 
 * Query Patterns:
 * - User.find({ role: "admin" }) - Admin dashboard user list
 * - User.find({ role: "voter", isVoted: false }) - Who hasn't voted yet
 * 
 * Performance Impact:
 * - Without index: O(n) collection scan
 * - With index: O(log n) B-tree lookup
 * 
 * Cardinality: Low (only 2 values: voter, admin)
 * - Index still beneficial due to high selectivity in queries
 * - Most queries filter by role first, then apply secondary filters
 */
userSchema.index({ role: 1 });

// Yes, here we exports the user cuz this is the component we'll be using in the logic.
export const User = model("User", userSchema);