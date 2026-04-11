// src/middleware/rateLimiter.js
// Simple in-memory rate limiter: max N messages per user per window

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 20;  // messages per window per user

/** @type {Map<string, { count: number, resetAt: number }>} */
const store = new Map();

// Clean up stale entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 5 * 60_000);

/**
 * Telegraf middleware that rate-limits per user.
 * Silently drops messages over the limit with a one-time warning.
 * @param {import('telegraf').Context} ctx
 * @param {Function} next
 */
export async function rateLimiter(ctx, next) {
  const userId = ctx.from?.id;
  if (!userId) return next();

  const key = String(userId);
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  entry.count += 1;

  if (entry.count > MAX_REQUESTS) {
    // Only warn once per window (at the exact threshold crossing)
    if (entry.count === MAX_REQUESTS + 1) {
      await ctx.reply(
        "You're sending messages too quickly. Please wait a moment."
      );
    }
    return; // Drop the message
  }

  return next();
}
