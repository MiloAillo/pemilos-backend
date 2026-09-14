import mongoose from "mongoose"
import { logger } from "../utils/logger.util"

export const connectToMongoose = async () => {
      const DB_USERNAME = String(process.env.MONGODB_ROOT_USER)
      const DB_PASSWORD = String(process.env.MONGODB_ROOT_PASSWORD)
      const DB_NAME = String(process.env.MONGODB_DATABASE)
      const DB_HOST = String(process.env.MONGODB_HOST)
      const DB_PORT = String(process.env.MONGODB_PORT)

      const encodedUsername = encodeURIComponent(DB_USERNAME)
      const encodedPassword = encodeURIComponent(DB_PASSWORD)
      const uri = `mongodb://${encodedUsername}:${encodedPassword}@${DB_HOST}:${DB_PORT}/${DB_NAME}?authSource=admin`

      try {
           await mongoose.connect(uri, {
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 5000,
           })
           logger.info("Connection to database established")
           return true
      } catch (err) {
           logger.error("Failed to establish a connection to database")
           return false
      }
}

export const disconnectMongo = async () => {
     await mongoose.connection.close()
     logger.info("Mongoose connection closed")
}