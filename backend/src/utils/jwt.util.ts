import { Request } from "express"
import jwt from "jsonwebtoken"
import { createError } from "../exceptions/error.exception"
import { Payload } from "./types.util"

export const generateToken = (userId: string, role: string, expiresIn: number) => {
     const JWT_KEY: string = String(process.env.JWT_KEY)
     return jwt.sign({
          role: role,
          id: userId
     }, JWT_KEY, {
          expiresIn,
          issuer: "pemilos-backend",
     })
}

export const verifyToken = (token: string) => {
     const JWT_KEY: string = String(process.env.JWT_KEY)
     try {
          return jwt.verify(token, JWT_KEY, {
               algorithms: ["HS256"],
               issuer: "pemilos-backend"
          })
     } catch (error) {
          return false
     }
}

export const getPayload = (req: Request) => {
     const token: string | undefined = req.get("Authorization")
     if (!token) {
          throw createError(
               "unauthorized",
               "token Not Found",
               401
          )
     }

     const JWT_KEY: string = String(process.env.JWT_KEY)
     try {
          const decoded = jwt.verify(token, JWT_KEY, {
               algorithms: ["HS256"],
               issuer: "pemilos-backend"
          }) as Payload
          return decoded
     } catch (error) {
          if (error instanceof jwt.TokenExpiredError) {
               throw createError(
                    "unauthorized",
                    "token expired",
                    401
               )
          }
          throw createError(
               "unauthorized",
               "invalid token",
               401
          )
     }
}