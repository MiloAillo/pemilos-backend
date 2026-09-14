/**
 * Application-wide constants
 * 
 * Purpose:
 * - Single source of truth for enumerated values
 * - Prevents magic strings scattered across codebase
 * - Enables validation at boundaries (Joi schemas, CSV imports)
 * 
 * Why centralized?
 * - Easier to update when school structure changes
 * - Validation schemas import these directly (DRY principle)
 * - Reduces risk of typos causing validation failures
 * 
 * Design Pattern: Configuration as Code
 * - Constants represent business rules (valid election types, valid classes)
 * - Changing these values automatically updates all dependent validations
 */

/**
 * Valid election labels (categories)
 * 
 * Used in:
 * - Candidate creation/validation
 * - Vote submission validation
 * - Result aggregation grouping
 * 
 * Values:
 * - "mpk": Majelis Perwakilan Kelas (Class Representative Council)
 * - "osis": Organisasi Siswa Intra Sekolah (Student Organization)
 * 
 * Why array?
 * - Easy iteration for dropdown options
 * - Direct use in Joi.valid(...LABEL)
 * - TypeScript can infer union type: "mpk" | "osis"
 */
export const LABEL: string[] = ["mpk", "osis"]

/**
 * Valid class identifiers for the school
 * 
 * Structure: "[Grade] [Major] [Class Number]"
 * - Grade: 10, 11, 12 (Indonesian high school years)
 * - Major: LK, PS, DKV, PPLG, TJKT (vocational tracks)
 * - Special: STAFF, GURU (teachers), ADMIN (administrators)
 * 
 * Majors:
 * - LK: Layanan Kesehatan (Health Services)
 * - PS: Perhotelan (Hospitality)
 * - DKV: Desain Komunikasi Visual (Visual Communication Design)
 * - PPLG: Pengembangan Perangkat Lunak dan Gim (Software & Game Development)
 * - TJKT: Teknik Jaringan Komputer dan Telekomunikasi (Computer Network & Telecom)
 * 
 * Used in:
 * - Voter CSV validation (reject invalid class names)
 * - Voter registration
 * - Statistical reporting by class
 * 
 * Why hardcoded?
 * - School structure changes infrequently (once per academic year)
 * - Keeps validation logic simple (no database lookup needed)
 * - For more dynamic needs, migrate to database table
 * 
 * Maintenance note:
 * - Update this array when new classes are added or removed
 * - Redeploy application for changes to take effect
 */
export const CLASS: string[] = [
     // Grade 10
     "10 LK 1",
     "10 LK 2",
     "10 PS 1",
     "10 PS 2",
     "10 DKV 1",
     "10 DKV 2",
     "10 DKV 3",
     "10 PPLG 1",
     "10 PPLG 2",
     "10 PPLG 3",
     "10 TJKT 1",
     "10 TJKT 2",
     
     // Grade 11
     "11 LK 1",
     "11 LK 2",
     "11 PS 1",
     "11 PS 2",
     "11 DKV 1",
     "11 DKV 2",
     "11 DKV 3",
     "11 PPLG 1",
     "11 PPLG 2",
     "11 PPLG 3",
     "11 TJKT 1",
     "11 TJKT 2",
     
     // Grade 12
     "12 LK 1",
     "12 LK 2",
     "12 PS 1",
     "12 PS 2",
     "12 DKV 1",
     "12 DKV 2",
     "12 DKV 3",
     "12 PPLG 1",
     "12 PPLG 2",
     "12 PPLG 3",
     "12 TJKT 1",
     "12 TJKT 2",
     
     // Staff categories
     "STAFF",  // Administrative staff
     "GURU",   // Teachers
     "ADMIN"   // System administrators
]