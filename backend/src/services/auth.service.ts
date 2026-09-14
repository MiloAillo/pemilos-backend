import { PostAuthLogin } from "../dtos/auth.dto";
import { createError } from "../exceptions/error.exception";
import { User } from "../models/user.model";
import { logAudit } from "../utils/audit.util";

export const authLogin = async (req: PostAuthLogin) => {
  try {
    // check if there is a user with those username
    const user = await User.findOne({
      username: req.username,
    }).exec();

    if (!user) {
      logAudit({
        timestamp: new Date().toISOString(),
        action: 'LOGIN_ATTEMPT',
        actor: req.username,
        actorRole: 'unknown',
        resource: 'auth',
        details: { username: req.username, reason: 'user not found' },
        success: false
      });
      throw createError("failed", "user with such credential not found", 400);
    }

    if (user.isVoted) {
      logAudit({
        timestamp: new Date().toISOString(),
        action: 'LOGIN_ATTEMPT',
        actor: req.username,
        actorRole: user.role,
        resource: 'auth',
        resourceId: user._id?.toString(),
        details: { username: req.username, reason: 'account already voted' },
        success: false
      });
      throw createError(
        "failed",
        "failed to logged in, your account already voted",
        401,
      );
    }

    // checks the password or token or, u said lah
    if (req.password != user.password) {
      logAudit({
        timestamp: new Date().toISOString(),
        action: 'LOGIN_ATTEMPT',
        actor: req.username,
        actorRole: user.role,
        resource: 'auth',
        resourceId: user._id?.toString(),
        details: { username: req.username, reason: 'invalid password' },
        success: false
      });
      throw createError("failed", "password is not valid", 400);
    }

    logAudit({
      timestamp: new Date().toISOString(),
      action: 'LOGIN_SUCCESS',
      actor: req.username,
      actorRole: user.role,
      resource: 'auth',
      resourceId: user._id?.toString(),
      details: { username: req.username, name: user.name },
      success: true
    });

    return user;
  } catch (err) {
    // Re-throw if already logged
    if ((err as any).status) {
      throw err;
    }
    
    logAudit({
      timestamp: new Date().toISOString(),
      action: 'LOGIN_ATTEMPT',
      actor: req.username,
      actorRole: 'unknown',
      resource: 'auth',
      details: { username: req.username, error: (err as Error).message },
      success: false
    });
    throw err;
  }
};
