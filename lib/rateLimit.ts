/**
 * In-memory sliding-window rate limiter and daily cap for /api/chat.
 *
 * NOTE ON SERVERLESS DEPLOYMENTS:
 * On serverless platforms (such as Vercel), this in-memory store is
 * per-instance and therefore acts as a soft limit. Each serverless function
 * execution instance maintains its own separate memory space. For a strict,
 * globally coordinated rate limit across all serverless instances, a shared
 * store (such as Upstash Redis or a database) should be used.
 */

const WINDOW_1M_MS = 60 * 1000; // 1 minute in ms
const WINDOW_1H_MS = 60 * 60 * 1000; // 1 hour in ms
const MAX_PER_MINUTE = 12; // 12 requests per minute
const MAX_PER_HOUR = 150; // 150 requests per hour

// Map from IP/key to array of request timestamps (epoch ms)
const store = new Map<string, number[]>();
let lastGlobalCleanup = 0;

/**
 * Extracts client IP from x-forwarded-for header (first value) or returns 'unknown'.
 */
export function getClientIp(
  requestOrHeaders?: Request | Headers | { headers: Headers } | null
): string {
  if (!requestOrHeaders) return 'unknown';

  let headers: Headers | null = null;
  if (requestOrHeaders instanceof Headers) {
    headers = requestOrHeaders;
  } else if ('headers' in requestOrHeaders && requestOrHeaders.headers instanceof Headers) {
    headers = requestOrHeaders.headers;
  } else if (
    'headers' in requestOrHeaders &&
    typeof (requestOrHeaders.headers as unknown as { get: (name: string) => string | null })?.get === 'function'
  ) {
    headers = requestOrHeaders.headers as Headers;
  }

  const forwardedFor = headers?.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  return 'unknown';
}

/**
 * Drops entries whose timestamps are all older than 1 hour, preventing
 * unbounded memory growth.
 */
export function cleanupOldEntries(now: number = Date.now()): number {
  let purgedKeys = 0;
  for (const [key, timestamps] of store.entries()) {
    const valid = timestamps.filter((t) => now - t < WINDOW_1H_MS);
    if (valid.length === 0) {
      store.delete(key);
      purgedKeys++;
    } else if (valid.length < timestamps.length) {
      store.set(key, valid);
    }
  }
  return purgedKeys;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Checks sliding window rate limit for a key (12/min, 150/hr).
 *
 * @param keyOrReq IP string, Request, or Headers
 * @param now Optional fake/override timestamp (ms) for testing
 */
export function rateLimit(
  keyOrReq: string | Request | Headers,
  now: number = Date.now()
): RateLimitResult {
  const key = typeof keyOrReq === 'string' ? keyOrReq : getClientIp(keyOrReq);

  // Periodically clean up stale keys across the entire store
  if (now - lastGlobalCleanup > WINDOW_1M_MS || store.size > 200) {
    cleanupOldEntries(now);
    lastGlobalCleanup = now;
  }

  const timestamps = store.get(key) || [];
  // Retain only timestamps from the last hour for this key
  const validTimestamps = timestamps.filter((t) => now - t < WINDOW_1H_MS);

  // 1. Check 1-minute window (max 12)
  const minuteTimestamps = validTimestamps.filter((t) => now - t < WINDOW_1M_MS);
  if (minuteTimestamps.length >= MAX_PER_MINUTE) {
    // Oldest timestamp in the 1-minute window determines when a slot frees up
    const oldestInMinute = minuteTimestamps[0];
    const retryMs = oldestInMinute + WINDOW_1M_MS - now;
    const retryAfterSeconds = Math.max(1, Math.ceil(retryMs / 1000));
    store.set(key, validTimestamps);
    return { allowed: false, retryAfterSeconds };
  }

  // 2. Check 1-hour window (max 150)
  if (validTimestamps.length >= MAX_PER_HOUR) {
    const oldestInHour = validTimestamps[0];
    const retryMs = oldestInHour + WINDOW_1H_MS - now;
    const retryAfterSeconds = Math.max(1, Math.ceil(retryMs / 1000));
    store.set(key, validTimestamps);
    return { allowed: false, retryAfterSeconds };
  }

  // Allowed: record timestamp
  validTimestamps.push(now);
  store.set(key, validTimestamps);

  return { allowed: true, retryAfterSeconds: 0 };
}

// Alias for convenience
export const checkRateLimit = rateLimit;

/**
 * Returns number of tracked keys in memory (useful for testing cleanup).
 */
export function getRateLimitStoreSize(): number {
  return store.size;
}

/**
 * Resets the in-memory rate limit store (for testing).
 */
export function resetRateLimits(): void {
  store.clear();
  lastGlobalCleanup = 0;
}

// -------------------------------------------------------------
// Global Daily Cap Management
// -------------------------------------------------------------

let dailyCount = 0;
let lastUtcDay = '';

export function getDailyCap(): number {
  const envVal = process.env.CHAT_DAILY_CAP;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 400; // Default 400 requests
}

/**
 * Checks if the global daily cap has been reached for the current UTC date.
 */
export function checkDailyCap(now: number = Date.now()): { allowed: boolean } {
  const currentUtcDay = new Date(now).toISOString().slice(0, 10);
  if (currentUtcDay !== lastUtcDay) {
    lastUtcDay = currentUtcDay;
    dailyCount = 0;
  }

  const cap = getDailyCap();
  if (dailyCount >= cap) {
    return { allowed: false };
  }
  return { allowed: true };
}

/**
 * Increments the daily request counter for the current UTC date.
 */
export function incrementDailyCap(now: number = Date.now()): void {
  const currentUtcDay = new Date(now).toISOString().slice(0, 10);
  if (currentUtcDay !== lastUtcDay) {
    lastUtcDay = currentUtcDay;
    dailyCount = 0;
  }
  dailyCount++;
}

/**
 * Returns current daily count (for testing / metrics).
 */
export function getDailyCount(now: number = Date.now()): number {
  const currentUtcDay = new Date(now).toISOString().slice(0, 10);
  if (currentUtcDay !== lastUtcDay) {
    lastUtcDay = currentUtcDay;
    dailyCount = 0;
  }
  return dailyCount;
}

/**
 * Resets daily cap state (for testing).
 */
export function resetDailyCap(): void {
  dailyCount = 0;
  lastUtcDay = '';
}
