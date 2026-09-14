/**
 * Security Audit Logging Utility
 * 
 * PURPOSE:
 * Provides structured, immutable audit trail for security-sensitive operations.
 * Used for compliance reporting, incident investigation, and regulatory requirements.
 * 
 * COMPLIANCE REQUIREMENTS:
 * - GDPR Article 30: Record of processing activities
 * - SOC2 Trust Principle: Logical and physical access controls monitoring
 * - ISO 27001: A.12.4.1 Event logging requirements
 * - Industry-specific: HIPAA (healthcare), PCI-DSS (payments)
 * 
 * WHAT TO AUDIT:
 * - Authentication events (login, logout, failed attempts)
 * - Authorization failures (access denied, role violations)
 * - Data access (viewing sensitive records)
 * - Data modifications (create, update, delete operations)
 * - Permission changes (role assignments, access grants)
 * - Configuration changes (system settings, feature flags)
 * - Administrative actions (user management, bulk operations)
 * 
 * WHAT NOT TO AUDIT:
 * - High-frequency read operations (would cause I/O bottleneck)
 * - Non-sensitive public data access
 * - Automated system health checks
 * 
 * SECURITY IMPLICATIONS:
 * - Audit logs are immutable once written (append-only)
 * - Never log passwords, tokens, or sensitive PII
 * - Protect log files with restricted permissions (chmod 640 or similar)
 * - Implement tamper detection (checksums, write-once storage)
 * - Consider log encryption for highly sensitive environments
 * 
 * WHEN TO USE:
 * Call logAudit() immediately after security-relevant operations, whether successful or failed.
 * Failed operations are often more important than successful ones for detecting attacks.
 * 
 * INTEGRATION:
 * - Import and call from middleware, services, and controllers
 * - Best practice: Audit in middleware for consistency
 * - Consider async logging in high-throughput scenarios
 * 
 * @example
 *   // In authentication service
 *   logAudit({
 *     action: 'user_login',
 *     actor: user.username,
 *     actorRole: user.role,
 *     resource: 'auth',
 *     details: { method: 'jwt' },
 *     ip: req.ip,
 *     success: true
 *   });
 * 
 * @example
 *   // Failed authorization attempt
 *   logAudit({
 *     action: 'access_denied',
 *     actor: user.username,
 *     actorRole: user.role,
 *     resource: 'admin_panel',
 *     details: { requiredRole: 'admin', endpoint: req.path },
 *     ip: req.ip,
 *     success: false
 *   });
 */

import { fileLogger } from './logger.util';

/**
 * Structured audit log entry interface
 * 
 * DESIGN PRINCIPLES:
 * - Who: actor and actorRole identify the user
 * - What: action describes the operation
 * - Where: resource and resourceId identify the target
 * - When: timestamp provides precise timing
 * - How: details captures operation-specific context
 * - Result: success indicates outcome (critical for failure analysis)
 * 
 * FIELD DESCRIPTIONS:
 * 
 * @property timestamp - ISO 8601 timestamp, auto-generated at log time
 * @property action - Operation type (e.g., 'user_login', 'vote_cast', 'admin_delete_user')
 *                    Use past tense, snake_case convention for consistency
 * @property actor - Username or identifier of user performing action
 *                   Use 'system' for automated operations
 * @property actorRole - Role of actor at time of action (admin, voter, candidate, etc.)
 *                       Important for tracking privilege escalation
 * @property resource - Type of resource accessed (e.g., 'users', 'votes', 'candidates')
 *                      Use plural, lowercase for consistency
 * @property resourceId - Specific resource identifier (user ID, vote ID, etc.)
 *                        Optional for bulk operations or resource-agnostic actions
 * @property details - Operation-specific context (old/new values, query params, etc.)
 *                     NEVER include passwords, tokens, or unmasked sensitive data
 * @property ip - Client IP address (for geolocation and attack pattern analysis)
 *                Consider storing IP hash for GDPR compliance (personal data minimization)
 * @property success - true if operation succeeded, false if failed/denied
 *                     Failed operations often indicate attack attempts or misconfigurations
 * 
 * DATA RETENTION:
 * - Define retention policy based on compliance requirements
 * - GDPR: Maximum data minimization period, typically 1-2 years
 * - SOC2: Minimum 1 year, recommended 2+ years
 * - Implement automated archival and deletion
 */
export interface AuditLogEntry {
  timestamp: string;
  action: string;
  actor: string;
  actorRole: string;
  resource: string;
  resourceId?: string;
  details: any;
  ip?: string;
  success: boolean;
}

/**
 * Write structured audit entry to persistent log file
 * 
 * BEHAVIOR:
 * 1. Accepts structured audit entry
 * 2. Adds/overwrites timestamp with current ISO 8601 time (ensures accuracy)
 * 3. Serializes to JSON for structured parsing
 * 4. Writes to file via Winston fileLogger (backend/logs/app.log)
 * 
 * FILE STORAGE:
 * - Location: backend/logs/app.log
 * - Format: One JSON object per line (JSONL format)
 * - Parsing: Can be processed by jq, Splunk, ELK, or custom scripts
 * 
 * PERSISTENCE GUARANTEE:
 * - Winston uses synchronous file I/O by default (ensures write even if process crashes)
 * - Consider async logging for high-throughput scenarios (with caveat of potential loss)
 * 
 * PRODUCTION CONSIDERATIONS:
 * - Implement log rotation (daily or size-based) to prevent disk exhaustion
 * - Consider shipping logs to centralized SIEM (Splunk, Datadog, ELK)
 * - Monitor log volume for unusual spikes (may indicate attack or bug)
 * - Implement alerting on critical audit events (multiple failed logins, admin actions)
 * 
 * PERFORMANCE:
 * - File I/O is blocking operation (~1-5ms per write)
 * - For high-frequency auditing (>100 ops/sec), consider:
 *   1. Async logging with buffer
 *   2. Message queue (RabbitMQ, Kafka) for log ingestion
 *   3. Sampling strategy (log 100% of failures, sample successes)
 * 
 * SECURITY:
 * - Validate that 'details' field doesn't contain sensitive data before logging
 * - Consider data masking utility for PII (email → e***@example.com)
 * - Restrict file permissions: chmod 640 (owner read/write, group read only)
 * - Implement integrity checks (checksums, digital signatures) for tamper detection
 * 
 * @param entry - Structured audit log entry
 * 
 * @example
 *   // Successful vote cast
 *   logAudit({
 *     action: 'vote_cast',
 *     actor: req.user.username,
 *     actorRole: 'voter',
 *     resource: 'votes',
 *     resourceId: candidate.id,
 *     details: { candidateName: candidate.name, electionId: election.id },
 *     ip: req.ip,
 *     success: true
 *   });
 * 
 * @example
 *   // Failed admin access attempt
 *   logAudit({
 *     action: 'access_denied',
 *     actor: req.user.username,
 *     actorRole: 'voter',
 *     resource: 'admin_panel',
 *     details: { requiredRole: 'admin', endpoint: req.originalUrl },
 *     ip: req.ip,
 *     success: false
 *   });
 * 
 * @example
 *   // System-initiated action
 *   logAudit({
 *     action: 'election_auto_close',
 *     actor: 'system',
 *     actorRole: 'system',
 *     resource: 'elections',
 *     resourceId: election.id,
 *     details: { reason: 'end_time_reached', closedAt: new Date().toISOString() },
 *     success: true
 *   });
 */
export const logAudit = (entry: AuditLogEntry) => {
  // Serialize entire entry to JSON for structured storage
  // Overwrites timestamp to ensure accuracy at log time (not caller time)
  const logMessage = JSON.stringify({
    ...entry,
    timestamp: new Date().toISOString()
  });
  
  // Write to persistent file via Winston fileLogger
  // This is a blocking I/O operation for guaranteed persistence
  fileLogger.info(logMessage);
};
