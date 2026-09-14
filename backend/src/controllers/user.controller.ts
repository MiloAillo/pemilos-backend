import { GetUser, PostUserCreate } from "../dtos/user.dto";
import { asyncHandler } from "../middlewares/async_handler.middleware";
import {
  deleteUserById,
  userCreate,
  userGetAll,
  userGetById,
} from "../services/user.service";
import { logger } from "../utils/logger.util";

export const createUser = asyncHandler(async (req, res) => {
  // parse the json from payload
  const { class: userClass, name, username, password, role } = req.body;

  // calls the service
  const user = await userCreate({
    name,
    username,
    password,
    class: userClass,
    role,
  } as PostUserCreate);

  res.status(201).json({
    status: "success",
    message: "user successfully created",
    data: user.toJSON,
  });
});

export const getAllUser = asyncHandler(async (req, res) => {
  // get the payload first as always
  const {
    page = 1,
    isVoted = false,
    class: userClass,
    role = "voter",
    name = "",
  } = req.query;

  // calls the service
  const users = await userGetAll({
    page,
    isVoted,
    class: userClass,
    role,
    name,
  } as GetUser);

  res.status(200).json({
    status: "success",
    message: "successfully get the user",
    data: users,
  });
  return;
});

export const getUserById = asyncHandler(async (req, res) => {
  // get from payload
  const { id } = req.params;

  // calls the service
  const user = await userGetById(id);

  res.status(200).json({
    status: "success",
    message: "successfully get the user by id",
    data: user,
  });
  return;
});

export const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await deleteUserById(id);

  return res.status(200).json({
    status: "success",
    message: "user successfully delete ",
  });
});
