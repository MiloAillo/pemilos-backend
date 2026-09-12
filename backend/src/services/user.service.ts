import { getUniqueHostnamesFromOptions } from "ioredis/built/cluster/util";
import { GetUser, PostUserCreate } from "../dtos/user.dto";
import { createError } from "../exceptions/error.exception";
import { User } from "../models/user.model";
import { logger } from "../utils/logger.util";

// Helper function to sanitize regex input and prevent NoSQL injection
const sanitizeRegex = (input: string): string => {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const userCreate = async (req: PostUserCreate) => {
  try {
    const user = await User.insertOne(req);
    return user;
  } catch (err) {
    throw err;
  }
};

export const userDeleteById = async (req: { id: string }) => {
  try {
    await User.findByIdAndDelete(req.id);
  } catch (err) {
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

    if (req.isVoted) {
      query.isVoted = true;
    }

    if (req.kelas) {
      query.class = req.kelas;
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
    await User.deleteOne({
      _id: id,
    });
  } catch (err) {
    throw err;
  }
};
