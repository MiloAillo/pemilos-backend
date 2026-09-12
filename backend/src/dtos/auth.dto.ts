import joi, {ObjectSchema} from "joi";

export type PostAuthLogin = {
     username: string,
     password: string,
}

export const postAuthLogin: ObjectSchema = joi.object().keys({
     username: joi.string().max(60).required(),
     password: joi.string().min(8).max(60).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/).required().messages({
          'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
     })
})