import { fileLogger } from './logger.util';

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

export const logAudit = (entry: AuditLogEntry) => {
  const logMessage = JSON.stringify({
    ...entry,
    timestamp: new Date().toISOString()
  });
  fileLogger.info(logMessage);
};
