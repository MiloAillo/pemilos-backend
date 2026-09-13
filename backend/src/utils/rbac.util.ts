import { Request } from 'express';
import { getPayload } from './jwt.util';
import { createError } from '../exceptions/error.exception';

export const requireRole = (req: Request, allowedRoles: string[]) => {
  const payload = getPayload(req);
  
  if (!allowedRoles.includes(payload.role)) {
    throw createError(
      "forbidden",
      `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      403
    );
  }
  
  return payload;
};
