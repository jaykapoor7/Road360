import type { DeviceId, TripId } from '@/lib/domain/schema';

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  // `crypto` is available in browsers, workers and Node 19+. There is no
  // Math.random fallback on purpose: ids collide silently and are unfixable
  // after the fact.
  crypto.getRandomValues(buf);
  return buf;
}

function encodeTime(now: number): string {
  let out = '';
  let t = now;
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    const mod = t % ENCODING_LEN;
    out = ENCODING[mod] + out;
    t = (t - mod) / ENCODING_LEN;
  }
  return out;
}

function encodeRandom(): string {
  const bytes = randomBytes(RANDOM_LEN);
  let out = '';
  for (let i = 0; i < RANDOM_LEN; i++) {
    out += ENCODING[bytes[i]! % ENCODING_LEN];
  }
  return out;
}

/**
 * ULID: a 26-character, URL-safe, lexicographically sortable id.
 *
 * Sorting matters — trips sort by id in creation order, so the primary key
 * doubles as a chronological index and cursor pagination needs no extra index.
 */
export function ulid(now: number = Date.now()): string {
  return encodeTime(now) + encodeRandom();
}

export const newTripId = (now?: number): TripId => ulid(now) as TripId;
export const newDeviceId = (): DeviceId => ulid() as DeviceId;
export const newEventId = (now?: number): string => ulid(now);

/** Deterministic 32-bit hash. Used to seed per-trip phrasing so wording is stable. */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
