import * as Crypto from 'expo-crypto';

export async function hashPin(pin: string) { const salt = Crypto.randomUUID(); const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`); return `${salt}:${hash}`; }
export async function verifyPin(pin: string, stored: string) { const [salt, expected] = stored.split(':'); if (!salt || !expected) return false; const actual = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`); return actual === expected; }
