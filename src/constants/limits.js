// Central limits for abuse / cost control and NLP resilience.

/** Max characters per natural-language message before NLP runs (input token safety). */
export const MAX_USER_MESSAGE_CHARS = 200;

/** Attempts for transient NLP API failures (429, 5xx, network). */
export const NLP_MAX_ATTEMPTS = 4;

/** First backoff base (ms); grows exponentially with cap {@link NLP_RETRY_MAX_MS}. */
export const NLP_RETRY_BASE_MS = 600;

/** Max single wait between NLP retries (ms). */
export const NLP_RETRY_MAX_MS = 10_000;

/**
 * If the first NLP response is still pending after this long, send one “still working”
 * message (same copy as first-retry notice). Cleared when parse finishes sooner.
 */
export const NLP_SLOW_NOTICE_AFTER_MS = 3200;

/** Refresh Telegram “typing” while waiting on NLP (indicator expires ~5s). */
export const NLP_TYPING_KEEPALIVE_MS = 4000;
