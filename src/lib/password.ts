import { hash, verify, Algorithm } from '@node-rs/argon2'
const HASH_OPTIONS = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }
export async function hashPassword(password: string): Promise<string> { return hash(password, HASH_OPTIONS) }
export async function verifyPassword(password: string, hashStr: string): Promise<boolean> { try { return await verify(hashStr, password) } catch { return false } }
