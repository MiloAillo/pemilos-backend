import { Schema, model } from "mongoose";
import { LABEL } from "../utils/variables.util";

/**
 * Candidate Schema
 * 
 * Represents candidates running for election in different categories (OSIS, MPK).
 * Each candidate is associated with a specific election label and identified by a unique number.
 * 
 * Business Context:
 * - Candidates are created by admins before election starts
 * - Each election category has its own set of candidates
 * - Voters see candidate list filtered by label before casting votes
 * - Results aggregate votes per candidate to determine winners
 * 
 * Relationship:
 * - Candidate (1) → (many) Votes
 * - No direct relationship to User (candidates may or may not be users)
 */
const candidateSchema = new Schema({
     /**
      * Name
      * 
      * Full name of the candidate or candidate pair (e.g., "John Doe & Jane Smith").
      * 
      * Display Usage:
      * - Shown on voting ballot
      * - Displayed in results dashboard
      * - Used in election announcements
      * 
      * Validation: Required to ensure every candidate is identifiable
      */
     name: {
          type: String,
          required: true,
     },

     /**
      * Label (Election Category)
      * 
      * Identifies which election this candidate is running in.
      * 
      * Business Logic:
      * - LABEL = ["OSIS", "MPK"] (defined in variables.util)
      * - Candidates only appear in their assigned category
      * - Results are calculated per label
      * 
      * Validation: Enum ensures candidates only belong to valid elections
      * 
      * Query Patterns:
      * - Candidate.find({ label: "OSIS" }) - Get all OSIS candidates
      * - Used for filtering ballot choices by election type
      * 
      * Performance Consideration:
      * - Consider adding index if candidate list queries become frequent
      * - Index: candidateSchema.index({ label: 1 })
      * - Currently not indexed (small dataset, infrequent writes)
      */
     label: {
          type: String,
          required: true,
          enum: LABEL // Restricts to predefined election categories
     },

     /**
      * Number (Candidate Identifier)
      * 
      * Sequential number assigned to each candidate within their election category.
      * 
      * Business Purpose:
      * - Provides easy reference for voters (e.g., "Vote for Candidate #3")
      * - Used for ballot ordering (display candidates sorted by number)
      * - Traditional election convention (numbered candidates)
      * 
      * Uniqueness Consideration:
      * - Should be unique per label (Candidate #1 OSIS ≠ Candidate #1 MPK)
      * - Not enforced at database level (allows flexibility)
      * - Application layer should validate uniqueness per label before insert
      * 
      * Data Type: Number (allows sorting: 1, 2, 3... not "1", "10", "2")
      * 
      * Example Data:
      * - { name: "Alice & Bob", label: "OSIS", number: 1 }
      * - { name: "Charlie & Dana", label: "OSIS", number: 2 }
      * - { name: "Eve & Frank", label: "MPK", number: 1 }
      * 
      * Future Enhancement:
      * - Add compound unique index: candidateSchema.index({ label: 1, number: 1 }, { unique: true })
      * - Enforces uniqueness at database level for data integrity
      */
     number: {
          type: Number,
          required: true,
     },

     /**
      * Image (Profile Photo URL)
      * 
      * URL or file path to candidate's profile picture or campaign poster.
      * 
      * Storage Strategy:
      * - Option 1: Store relative path if images hosted on same server
      *   Example: "/uploads/candidates/candidate-1-osis.jpg"
      * - Option 2: Store full URL if using CDN or external storage
      *   Example: "https://cdn.example.com/candidates/abc123.jpg"
      * - Option 3: Store cloud storage key (S3, GCS, Azure Blob)
      *   Example: "candidates/2026/osis/candidate1.jpg"
      * 
      * Optional Field:
      * - Not required (allows candidate registration without immediate photo)
      * - Can be updated later by admin
      * - Frontend should handle missing images gracefully (placeholder/avatar)
      * 
      * Security Considerations:
      * - Validate file type on upload (only images: .jpg, .png, .webp)
      * - Sanitize filename to prevent path traversal attacks
      * - Limit file size to prevent storage abuse
      * - Use Content-Security-Policy headers when serving images
      * 
      * Performance:
      * - Consider image optimization (resize, compress) before storage
      * - Use lazy loading on frontend for faster page load
      * - Implement caching headers for CDN/browser cache
      */
     image: String,
}, { 
     /**
      * Timestamps: { createdAt, updatedAt }
      * 
      * Automatically managed by Mongoose.
      * 
      * Business Value:
      * - createdAt: When candidate was registered (audit trail)
      * - updatedAt: Last modification time (track profile updates)
      * 
      * Admin Use Cases:
      * - Track candidate registration timeline
      * - Verify candidates added before election start time
      * - Audit trail for candidate profile changes
      * 
      * Immutability:
      * - Candidates should not be modified after voting starts
      * - Consider adding "election_status" field to lock changes
      * - Application logic should prevent edits during active voting period
      */
     timestamps: true 
})

/**
 * Potential Future Indexes:
 * 
 * 1. Label Index (for filtering candidates by election):
 *    candidateSchema.index({ label: 1 })
 *    - Use Case: GET /api/candidates?label=OSIS
 *    - Priority: Low (small dataset, simple query)
 * 
 * 2. Compound Unique Index (enforce unique numbers per label):
 *    candidateSchema.index({ label: 1, number: 1 }, { unique: true })
 *    - Use Case: Prevent duplicate candidate numbers in same election
 *    - Priority: Medium (data integrity improvement)
 * 
 * 3. Compound Index for Sorted Queries:
 *    candidateSchema.index({ label: 1, number: 1 })
 *    - Use Case: GET /api/candidates?label=OSIS&sort=number
 *    - Priority: Low (MongoDB sorts in memory for small result sets)
 * 
 * Current Approach: No indexes (besides default _id)
 * Rationale: Small collection size (< 20 candidates), infrequent queries
 * Recommendation: Add indexes if candidate count exceeds 100 or query latency > 50ms
 */

export const Candidate = model('Candidate', candidateSchema)