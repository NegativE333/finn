// src/middleware/session.js
// Lightweight in-memory session store for multi-step flows (confirmations, undo, etc.)
// For production scale, swap the Map for Redis.

/** @type {Map<string, object>} */
const sessions = new Map();

const SESSION_TTL_MS = 10 * 60_000; // 10 minutes

// Expire stale sessions
setInterval(() => {
  const now = Date.now();
  for (const [key, sess] of sessions.entries()) {
    if (sess.__expiresAt <= now) sessions.delete(key);
  }
}, 60_000);

/**
 * Telegraf middleware that attaches `ctx.session` to each update.
 * Session is keyed by Telegram user ID and persists across messages within the TTL.
 */
export async function sessionMiddleware(ctx, next) {
  const key = String(ctx.from?.id ?? "anon");
  const now = Date.now();

  let sess = sessions.get(key);
  if (!sess || sess.__expiresAt <= now) {
    sess = { __expiresAt: now + SESSION_TTL_MS };
    sessions.set(key, sess);
  }

  ctx.session = sess;

  await next();

  // Refresh TTL on every interaction
  sess.__expiresAt = Date.now() + SESSION_TTL_MS;
}

/**
 * Clear the session for a user (e.g. after completing a flow).
 * @param {string|number} userId
 */
export function clearSession(userId) {
  sessions.delete(String(userId));
}
