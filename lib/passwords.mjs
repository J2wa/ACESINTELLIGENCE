import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(pbkdf2);
export const PASSWORD_ITERATIONS = 600000;
export function passwordHashInfo(value) {
  const match = /^pbkdf2\$(100000|600000)\$([a-f0-9]{64})\$([a-f0-9]{64})$/.exec(value ?? '');
  return match ? { iterations: Number(match[1]), salt: match[2], digest: match[3] } : null;
}
export async function hashPassword(password, salt = randomBytes(32).toString('hex'), iterations = PASSWORD_ITERATIONS) {
  const digest = await derive(password, salt, iterations, 32, 'sha256');
  return `pbkdf2$${iterations}$${salt}$${digest.toString('hex')}`;
}
const dummy = `pbkdf2$${PASSWORD_ITERATIONS}$${'0'.repeat(64)}$${'0'.repeat(64)}`;
export async function checkPassword(password, encoded) {
  const info = passwordHashInfo(encoded), target = info ?? passwordHashInfo(dummy);
  const actual = await derive(password, target.salt, target.iterations, 32, 'sha256');
  const valid = timingSafeEqual(actual, Buffer.from(target.digest, 'hex'));
  return !!info && valid;
}
export const needsPasswordUpgrade = encoded => passwordHashInfo(encoded)?.iterations !== PASSWORD_ITERATIONS;
