import { hash, verify } from '@node-rs/argon2'
// `Algorithm` est déclaré `const enum` dans @node-rs/argon2 : inutilisable sous
// `isolatedModules`, le compilateur ne pouvant pas l'inliner. La valeur est
// stable et fait partie de l'API du binding : Argon2d=0, Argon2i=1, Argon2id=2.
const ARGON2ID = 2
const HASH_OPTIONS = { algorithm: ARGON2ID, memoryCost: 19456, timeCost: 2, parallelism: 1 }
export async function hashPassword(password: string): Promise<string> { return hash(password, HASH_OPTIONS) }
export async function verifyPassword(password: string, hashStr: string): Promise<boolean> { try { return await verify(hashStr, password) } catch { return false } }
