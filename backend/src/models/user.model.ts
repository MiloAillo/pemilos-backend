import mongoose from "mongoose";
import { CLASS, LABEL } from "../utils/variables.util";
const { Schema, model } = mongoose;

/* 
For those who reads this repo, this is one of Mongoose's basics: Schema and Models

*Collection is basically a Table in MongoDB term.

Schema is a definition of Collection. That's it! Just the "definition". Consisting of SchemaTypes

And then comes a Model, which is an implementation of schema in the database. Model is directly
correlated to the Collection.

so:

Schema -> Model -> Collection
*/

// This is the user schema.
const userSchema = new Schema({
      // One of the credentials used by user to vote. A NISN
      username: {
           type: String,
           required: true,
           unique: true
      },

      /* 
      
      Above, lies an SchemaType. Which is a definition of Field, there is so much thing here.\
      Like type (the field's type of course) and some other attribute like unique, lowercase, etc.

      */

      // The real name of user
      name: {
           type: String,
           required: true,
      },
      // Role, whether is admin or voter
      role: {
           type: String,
           required: true,
           enum: ["voter", "admin"],
           default: "voter"
      },
      // Class, if the user is staff or teacher, just write so.
      class: {
           type: String,
           required: true,
           enum: CLASS
      },
      // Password, credentials of user will be used.
      password: {
           type: String,
           required: true,
      },
      // IsVoted, this is a denormalization
      isVoted: {
           type: Boolean,
           required: true,
           default: false
      }
}, { timestamps: true })

// Add index for role queries
userSchema.index({ role: 1 });

// Yes, here we exports the user cuz this is the component we'll be using in the logic.
export const User = model("User", userSchema);