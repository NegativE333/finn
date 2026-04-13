// src/services/scheduler.js
// Daily morning enqueue + Postgres-backed worker (yesterday spending digest).

import cron from "node-cron";
import { enqueueYesterdayDigestJobs, runReminderWorkerTick } from "./reminderQueue.js";

const WORKER_INTERVAL_MS = 10_000;

/**
 * Morning cron enqueues “yesterday spending” digests; worker sends with rate limits + retries.
 * @param {import('telegraf').Telegraf} bot
 */
export function startScheduler(bot) {
  cron.schedule(
    "0 0 * * *",
    async () => {
      console.log("[CRON] Enqueue morning yesterday spending digests...");
      try {
        const { enqueued, users } = await enqueueYesterdayDigestJobs();
        console.log(`[CRON] Enqueued ${enqueued} digest job(s) for ${users} user(s).`);
      } catch (err) {
        console.error("[CRON] Enqueue failed:", err);
      }
    },
    { timezone: "Etc/UTC" }
  );

  setInterval(() => {
    runReminderWorkerTick(bot).catch((err) =>
      console.error("[QUEUE] Worker tick failed:", err)
    );
  }, WORKER_INTERVAL_MS);

  setTimeout(() => {
    runReminderWorkerTick(bot).catch((err) =>
      console.error("[QUEUE] Initial worker tick failed:", err)
    );
  }, 3000);

  console.log(
    `[CRON] Morning digest: enqueue daily at 00:00 UTC (05:30 IST); worker every ${WORKER_INTERVAL_MS / 1000}s.`
  );
}
