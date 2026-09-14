import joi, { ObjectSchema } from "joi"
import { LABEL } from "../utils/variables.util"

/**
 * DTO for candidate creation request payload
 * 
 * Represents a candidate for either OSIS or MPK position
 */
export type PostCandidateCreate = {
     name: string,     // Candidate or team name
     label: "osis" | "mpk", // Position type
     number: number,   // Display number (e.g., candidate #1, #2, #3)
     image: string     // Image URL or base64 data
}

/**
 * Validation schema for candidate creation
 * 
 * Validation occurs at the DTO layer (request boundary) to:
 * - Ensure all required candidate information is present
 * - Validate position type against allowed values
 * - Prevent creation of incomplete candidate records
 * 
 * Business rules:
 * - LABEL enum restricts candidates to "osis" or "mpk" positions only
 * - Number field is used for display/ordering (not primary key)
 * - Name must be at least 3 characters to prevent trivial entries
 * 
 * Security considerations:
 * - Image field accepts any string (URL or data URI)
 * - Consider adding format validation for image field
 * - Consider adding number range validation (e.g., 1-99)
 * 
 * Note: Number field is for display purposes only. The MongoDB _id field
 * serves as the primary key for database operations and vote references
 */
export const postCandidateCreate: ObjectSchema = joi.object().keys({
     // Candidate or team name - minimum 3 characters prevents trivial names
     name: joi.string().min(3).required(),
     
     // Position label - validated against LABEL constant ("osis" or "mpk")
     // Determines which election category this candidate belongs to
     label: joi.string().valid(...LABEL).required(),
     
     // Display number for UI ordering and identification
     // Not used as primary key - MongoDB ObjectID serves that purpose
     // Consider adding .positive() and .integer() validation
     number: joi.number().required(),
     
     // Image URL or data URI for candidate photo
     // TODO: Consider adding format validation (URL or data URI pattern)
     // TODO: Consider adding size limits for base64 images
     image: joi.string().required()
})