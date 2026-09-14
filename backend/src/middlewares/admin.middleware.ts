import { createError } from "../exceptions/error.exception";
import { getPayload } from "../utils/jwt.util";
import { MiddlewareHandler } from "../utils/types.util";

export const adminMiddleware: MiddlewareHandler = async (req, res, next) => {
  // first, decode the payload from request.
  const payload = getPayload(req);

  if (payload.role !== "admin") {
    throw createError("unauthorized", "you're not an admin", 401);
  }

  next();
};
