import { getUniqueHostnamesFromOptions } from "ioredis/built/cluster/util";
import { GetUser, PostUserCreate } from "../dtos/user.dto";
import { createError } from "../exceptions/error.exception";
import { User } from "../models/user.model";
import { logger } from "../utils/logger.util";
import { logAudit } from "../utils/audit.util";

// Helper function to sanitize regex input and prevent NoSQL injection
const sanitizeRegex = (input: string): string => {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const userCreate = async (req: PostUserCreate) => {
  try {
    const user = await User.insertOne(req);
    
    logAudit({
      timestamp: new Date().toISOString(),
      action: 'USER_CREATE',
      actor: 'system',
      actorRole: 'admin',
      resource: 'user',
      resourceId: user._id?.toString(),
      details: { username: req.username, name: req.name, class: req.class, role: req.role },
      success: true
    });
    
    return user;
  } catch (err) {
    logAudit({
      timestamp: new Date().toISOString(),
      action: 'USER_CREATE',
      actor: 'system',
      actorRole: 'admin',
      resource: 'user',
      details: { username: req.username, name: req.name, error: (err as Error).message },
      success: false
    });
    throw err;
  }
};

export const userDeleteById = async (req: { id: string }) => {
  try {
    const user = await User.findById(req.id).lean();
    await User.findByIdAndDelete(req.id);
    
    logAudit({
      timestamp: new Date().toISOString(),
      action: 'USER_DELETE',
      actor: 'system',
      actorRole: 'admin',
      resource: 'user',
      resourceId: req.id,
      details: { username: user?.username, name: user?.name },
      success: true
    });
  } catch (err) {
    logAudit({
      timestamp: new Date().toISOString(),
      action: 'USER_DELETE',
      actor: 'system',
      actorRole: 'admin',
      resource: 'user',
      resourceId: req.id,
      details: { error: (err as Error).message },
      success: false
    });
    throw err;
  }
};

export const userGetAll = async (req: GetUser) => {
  try {
    // make a vars for pagination.
    const skip = (page: number) => {
      return --page * 100;
    };
    // limits the user quantities to 10
    const limit = 100;

    // make a query class so that class field can dynamically defined or not
    const query: any = {
      role: req.role,
      // Sanitize regex input to prevent NoSQL injection
      name: {
        $regex: sanitizeRegex(req.name),
        $options: "i",
      },
    };

    if (req.isVoted && (req.isVoted !== undefined || req.isVoted !== null)) {
      query.isVoted = req.isVoted;
    }

    if (req.class) {
      query.class = req.class;
    }

    const users = await User.find()
      .where(query)
      .select("name class username _id isVoted password role")
      .skip(skip(req.page))
      .limit(limit)
      .lean();
    return users;
  } catch (err) {
    throw err;
  }
};

export const userGetById = async (id: string) => {
  try {
    const user = await User.findById(id).lean();
    return user;
  } catch (err) {
    throw err;
  }
};

export const deleteUserById = async (id: string) => {
  try {
    const user = await User.findById(id).lean();
    await User.deleteOne({
      _id: id,
    });
    
    logAudit({
      timestamp: new Date().toISOString(),
      action: 'USER_DELETE',
      actor: 'system',
      actorRole: 'admin',
      resource: 'user',
      resourceId: id,
      details: { username: user?.username, name: user?.name },
      success: true
    });
  } catch (err) {
    logAudit({
      timestamp: new Date().toISOString(),
      action: 'USER_DELETE',
      actor: 'system',
      actorRole: 'admin',
      resource: 'user',
      resourceId: id,
      details: { error: (err as Error).message },
      success: false
    });
    throw err;
  }
};
