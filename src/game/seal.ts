/**
 * The chain is sealed: each step's record (which summit, which puzzle, the
 * clue that leads there) is AES-GCM encrypted with a key derived from the
 * previous step's answer. Answers themselves are never shipped; a step only
 * carries a salted hash of its own answer, so it can be validated even when
 * the next record does not exist yet.
 *
 * Self-contained (WebCrypto only): also imported by scripts/seal-chain.ts.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
const SALT = 'paperalps/1';

export interface Box {
  iv: string; // base64
  ct: string; // base64
}

/** Canonical form of an answer: Unicode-normalised, trimmed, lower case, single spaces. */
export function norm(s: string): string {
  return s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function sha(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** Hash that validates `answer` for step `n` (1-based). */
export async function okHash(n: number, answer: string): Promise<string> {
  const h = await sha(`${SALT}|ok|${n}|${norm(answer)}`);
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function keyFor(n: number, answer: string): Promise<CryptoKey> {
  const raw = await sha(`${SALT}|key|${n}|${norm(answer)}`);
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Seal `obj` so that only the answer of step `n` opens it. */
export async function seal(obj: unknown, n: number, answer: string): Promise<Box> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(n, answer), enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

/** Open a box with the answer of step `n`; null when the answer is wrong. */
export async function unseal<T>(box: Box, n: number, answer: string): Promise<T | null> {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) as BufferSource }, await keyFor(n, answer), unb64(box.ct) as BufferSource);
    return JSON.parse(dec.decode(pt)) as T;
  } catch {
    return null;
  }
}
