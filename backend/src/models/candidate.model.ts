import { Schema, model } from "mongoose";
import { LABEL } from "../utils/variables.util";

const candidateSchema = new Schema({
     name: {
          type: String,
          required: true,
     },
     label: {
          type: String,
          required: true,
          enum: LABEL
     },
     number: {
          type: Number,
          required: true,
     },
     image: String,
}, { timestamps: true })

export const Candidate = model('Candidate', candidateSchema)