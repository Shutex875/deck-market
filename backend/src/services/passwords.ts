import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const options = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const keyLength = 64;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, hash?: string): Promise<boolean> {
  const valid = hash?.match(/^scrypt:([0-9a-f]{32}):([0-9a-f]{128})$/);
  const salt = valid ? Buffer.from(valid[1], 'hex') : Buffer.alloc(16);
  const expected = valid ? Buffer.from(valid[2], 'hex') : Buffer.alloc(keyLength);
  const actual = await deriveKey(password, salt);
  return timingSafeEqual(actual, expected) && Boolean(valid);
}
