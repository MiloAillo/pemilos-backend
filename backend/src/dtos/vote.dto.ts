import joi, { ObjectSchema } from "joi"

// For those who confuses, the namin convention: methodActionModel
// ex: Post(method)Insert(Action)Vote(Model)

export type PostInsertVote = {
     osis: number,
     mpk: number
}

export const postInsertVote: ObjectSchema = joi.object().keys({
     osis: joi.number().integer().min(1).max(999).required(),
     mpk: joi.number().integer().min(1).max(999).required()
})

export type DeleteResetVote = {
     username: string
}

export const deleteResetVote = joi.object().keys({
     username: joi.string().required()
})