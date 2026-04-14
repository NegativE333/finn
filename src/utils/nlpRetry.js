import {
  NLP_MAX_ATTEMPTS,
  NLP_RETRY_BASE_MS,
  NLP_RETRY_MAX_MS,
} from "../constants/limits.js";

/**
 * @param {unknown} err
 * @returns {number | undefined}
 */
function getHttpStatus(err) {
  if (err == null || typeof err !== "object") return undefined;
  const o = /** @type {Record<string, unknown>} */ (err);
  if (typeof o.status === "number") return o.status;
  const res = o.response;
  if (res && typeof res === "object" && typeof /** @type {any} */ (res).status === "number") {
    return /** @type {any} */ (res).status;
  }
  if (typeof o.statusCode === "number") return o.statusCode;
  return undefined;
}

/**
 * True when the error is often transient (rate limits, overload, network).
 * @param {unknown} err
 */
export function isRetryableNlpError(err) {
  const status = getHttpStatus(err);
  if (status === 429) return true;
  if (status != null && status >= 500 && status < 600) return true;

  const code =
    err && typeof err === "object" && "code" in err
      ? String(/** @type {any} */ (err).code)
      : "";
  if (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    code === "EAI_AGAIN" ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  ) {
    return true;
  }

  const msg = String(
    err && typeof err === "object" && "message" in err
      ? /** @type {any} */ (err).message
      : err
  ).toLowerCase();
  if (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("over capacity") ||
    msg.includes("timeout") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("service unavailable")
  ) {
    return true;
  }

  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attemptIndex) {
  const raw = NLP_RETRY_BASE_MS * 2 ** attemptIndex;
  const capped = Math.min(NLP_RETRY_MAX_MS, raw);
  const jitter = Math.floor(Math.random() * 300);
  return capped + jitter;
}

/**
 * Run an async NLP/API call with exponential backoff on retryable errors.
 * @template T
 * @param {() => Promise<T>} operation
 * @param {{ label?: string; onFirstRetryNotify?: () => Promise<void> }} [options]
 *   `onFirstRetryNotify` — called once after the **first** attempt fails with a retryable error,
 *   before waiting and retrying (e.g. tell the user to wait).
 * @returns {Promise<T>}
 */
export async function withNlpRetries(operation, options = {}) {
  const label = options.label ?? "NLP";
  const onFirstRetryNotify = options.onFirstRetryNotify;
  let lastErr;

  for (let attempt = 0; attempt < NLP_MAX_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastErr = err;
      if (!isRetryableNlpError(err)) {
        throw err;
      }
      if (attempt === NLP_MAX_ATTEMPTS - 1) {
        throw err;
      }
      const wait = backoffMs(attempt);
      const status = getHttpStatus(err);
      console.warn(
        `[${label}] attempt ${attempt + 1}/${NLP_MAX_ATTEMPTS} failed` +
          (status != null ? ` (HTTP ${status})` : "") +
          `: ${err && typeof err === "object" && "message" in err ? /** @type {any} */ (err).message : String(err)} — retry in ${wait}ms`
      );
      if (attempt === 0 && typeof onFirstRetryNotify === "function") {
        try {
          await onFirstRetryNotify();
        } catch (notifyErr) {
          console.warn(`[${label}] onFirstRetryNotify failed:`, /** @type {any} */ (notifyErr)?.message);
        }
      }
      await sleep(wait);
    }
  }

  throw lastErr;
}
