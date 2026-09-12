import mongoose, { model, Schema } from "mongoose";
import { LABEL } from "../utils/variables.util";

/* 

To make a field related with another document,
you can use type: "Schema.Types.ObjectId" and a "ref".

ObjectId is a Mongoose exclusive DataType where it can be recognized as an _id.
When we cast the function .populate() to this model, this field will turn into the owner of the _id or the referred document.

*/

const voteSchema = new Schema({
     label: {
          type: String,
          required: true,
          enum: LABEL,
     },

     user: {
          // The objectId type, the reason why it can be treated as an _id when saving a document.
          type: Schema.Types.ObjectId,
          // Fill the referred Model.
          ref: "User",
          required: true,
     },
     
     candidate: {
          type: Schema.Types.ObjectId,
          ref: "Candidate",
          required: true,
     }
})

// Compound unique index to prevent duplicate votes per user per label
voteSchema.index({ user: 1, label: 1 }, { unique: true })

export const Vote = model("Vote", voteSchema)