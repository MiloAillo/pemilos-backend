import { NextFunction, Request, Response } from "express";

/**
 * Shared type definitions across the application
 * 
 * Purpose:
 * - Single source of truth for domain types
 * - Enforces type safety at compile time
 * - Documents data contracts between layers (controller -> service -> repository)
 * 
 * Convention:
 * - Types ending in *Cache represent Redis storage format (strings)
 * - Types without *Cache represent application-level format (parsed objects)
 */

/**
 * Voter entity structure
 * 
 * Used for:
 * - Parsing CSV voter uploads
 * - Seeding voter database
 * - Voter authentication and registration
 * 
 * Source: Admin uploads CSV with voter credentials
 */
export type Voter = {
  name: string;        // Full name of voter
  username: string;    // Unique identifier (NIS/employee ID)
  class: string;       // Must match CLASS constant in variables.util.ts
  password: string;    // Plain text in CSV, hashed before storage
  isVoted: boolean     // Tracks if voter has cast their ballot
}

/**
 * Express middleware function signature
 * 
 * Why define this?
 * - Ensures all custom middleware follow Express conventions
 * - Supports both sync and async middleware patterns
 * - Type-safe middleware composition
 */
export type MiddlewareHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void> | void;

/**
 * Application-level settings (deserialized from Redis)
 * 
 * Used in:
 * - Vote validation (check if voting is currently allowed)
 * - Candidate list rendering
 * 
 * Why optional fields?
 * - Allows partial updates (e.g., toggle voting without reloading candidates)
 * - Gradual initialization during server startup
 */
export type Settings = {
  isVotingAllowed?: boolean,           // Global voting toggle
  candidates?: RedisCandidateCache[]   // Array of active candidates
}

/**
 * Redis hash field structure for "setting" key
 * 
 * Why strings?
 * - Redis stores everything as strings, requires manual serialization
 * - Type enforces "true"/"false" literals to prevent bugs
 * 
 * Conversion:
 * - isVotingAllowed: string -> boolean via === "true"
 * - candidates: string -> array via JSON.parse()
 * 
 * This type represents the wire format, not the application format
 */
export type RedisSettingCache = {
  isVotingAllowed: "true" | "false",  // String boolean for Redis storage
  candidates: string                   // JSON-serialized array
}

/**
 * JWT token payload structure
 * 
 * Embedded in:
 * - Access tokens (short-lived, in Authorization header)
 * - Refresh tokens (long-lived, in HTTP-only cookie)
 * 
 * Security note:
 * - Keep payload minimal to reduce token size
 * - Never include sensitive data (password, PII)
 * - Role determines authorization boundaries (voter vs admin routes)
 */
export type Payload = {
  id: string,                    // MongoDB _id for user lookup
  role: "voter" | "admin"        // Authorization level
}

/**
 * Cached candidate data structure
 * 
 * Why cache candidates?
 * - Read on every vote submission
 * - Rarely changes (only during election setup)
 * - Redis read ~1ms vs MongoDB ~20ms
 * 
 * Fields:
 * - id: MongoDB _id for vote recording
 * - label: "mpk" or "osis" (election category)
 * - number: Candidate number displayed on ballot
 * - image: Cloudinary URL for candidate photo
 */
export type RedisCandidateCache = {
  id: string,
  label: string,
  number: string,
  image: string
}

/**
 * Vote aggregation result from MongoDB
 * 
 * Returned by:
 * - Vote.aggregate() pipeline for counting votes
 * 
 * Structure:
 * - _id: The grouped field value (e.g., isVoted: true/false)
 * - count: Number of documents in that group
 * 
 * Example output:
 *   [{ _id: true, count: 150 }, { _id: false, count: 50 }]
 */
export type VoteCount = {
  _id: boolean,  // Grouped by isVoted field
  count: number  // Number of voters in this group
}