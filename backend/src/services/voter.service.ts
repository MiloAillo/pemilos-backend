import { Settings, VoteCount, Voter } from "../utils/types.util";
import { User } from "../models/user.model";
import { createError } from "../exceptions/error.exception";
import { getRedlock } from "../configs/redlock.config";
import { PostInsertVote } from "../dtos/vote.dto";
import { Vote } from "../models/vote.model";
import { getRedisClient } from "../configs/redis.config";
import debounce from "lodash/debounce";
import { getPusherClient } from "../configs/pusher.config";
import { Candidate } from "../models/candidate.model";
import { fileLogger, logger } from "../utils/logger.util";

// receive one or more user, and then input it to database.
export const voterSaveMany = async (voters: Voter[]) => {
  try {
    await User.insertMany(voters, {
      ordered: true,
    });
  } catch (err) {
    throw createError("failed", "failed to insert the voter csv", 500, err);
  }
};

export const voterSaveVote = async (req: PostInsertVote, userId: string) => {
  const redlock = getRedlock();
  const lockName = `user:vote:${userId}`;
  let lock: any;

  try {
    // Acquire lock
    lock = await redlock.acquire([lockName], 10000);

    const rawData = await getRedisClient().hget("setting", "isVotingAllowed");
    if (rawData !== "true") {
      throw createError("failed", "vote not allowed", 401);
    }

    const [osis, mpk] = await Promise.all([
      Candidate.findOne({ _id: req.osis, label: "osis" }),
      Candidate.findOne({ _id: req.mpk, label: "mpk" }),
    ]);
    if (!osis || !mpk) {
      throw createError("failed", "candidate chosen is not valid", 400);
    }

    const user = await User.findById(userId);
    if (!user) {
      throw createError("failed", "user with such id not found", 400);
    }
    if (user.isVoted || (await Vote.findOne({ user: userId }))) {
      throw createError("failed", "user already voted", 400);
    }
    if (user.role === "admin") {
      throw createError("failed", "bro u're literally admin, why u vote", 400);
    }

    await Vote.insertMany(
      [
        { label: "osis", user: userId, candidate: req.osis },
        { label: "mpk", user: userId, candidate: req.mpk },
      ],
      { ordered: true }
    );
    await User.findByIdAndUpdate(userId, { $set: { isVoted: true } });

    voterPushLiveCount();
    fileLogger.info(`${user.name} voted ${osis.name} - ${mpk.name}`);
  } finally {
    if (lock) {
      try {
        await lock.release();
      } catch (err) {
        fileLogger.error("Failed to release lock", err);
      }
    }
  }
};


export const voterGetResult = async (label: string) => {
  try {
    const results = await Vote.aggregate([
      // Dynamically search, this aggregate simply take all votes based on label
      { $match: { label } },

      // Groups the newly queried result by their candidateId, so the result is as much as the candidates available.
      // Also adds a path or field named column, to sum up the grouped vote.
      {
        $group: {
          _id: "$candidate",
          count: { $sum: 1 },
        },
      },

      //  Since the available identifier for candidates is only the _id. This $lookup will cast it
      //  into a real candidates, with their own name, number, etc.
      {
        $lookup: {
          from: "candidates",
          localField: "_id",
          foreignField: "_id",
          as: "candidate",
        },
      },

      //  candidate that looked up is an array, so let's cast it into one single beautiful object cihuy
      { $unwind: "$candidate" },

      //  Finalize the result, casts some unnecessary field like _id (set it to 0) and candidates (just do ont mention it)
      {
        $project: {
          _id: 0,
          name: "$candidate.name",
          number: "$candidate.number",
          count: 1,
        },
      },

      //  sort based on number
      { $sort: { number: 1 } },
    ]);

    return results;
  } catch (err) {
    throw err;
  }
};

// Result is empty, only trigger frontend to fetch another API for the voting count
export const voterPushLiveCount = debounce(async () => {
  const result = ""

  const pusher = await getPusherClient();

  pusher.trigger("pemilose", "pemilolot", result);
  return;
}, 3000);

export const voterResetVote = async (username: string) => {
  try {
    const user = await User.findOneAndUpdate(
      {
        username: username,
      },
      {
        $set: {
          isVoted: false,
        },
      },
    );

    if (!user) {
      throw createError("failed", "user with such credentials not found", 401);
    }

    await Vote.deleteMany({
      user: user._id,
    });
  } catch (err) {
    throw err;
  }
};

export const voterCount = async () => {
  try {
    const result: VoteCount[] = await User.aggregate([
      {
        $match: {
          role: "voter",
        },
      },
      {
        $group: {
          _id: "$isVoted",
          count: {
            $sum: 1,
          },
        },
      },
    ]);

    return result;
  } catch (err) {
    throw err;
  }
};
