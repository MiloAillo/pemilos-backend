import crypto from 'crypto';

export const generatePassword = (username: string) => {
     // Password akan menyesuaikan kemauan osis.
     const randString = makeid(6)
     const token = `${randString}:${username}`

     return token
}

export function makeid(length: number) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let result = '';
    
    // Use crypto.randomBytes for secure random generation
    const randomBytes = crypto.randomBytes(length);
    
    for (let i = 0; i < length; i++) {
        result += characters.charAt(randomBytes[i] % charactersLength);
    }
    
    return result;
}