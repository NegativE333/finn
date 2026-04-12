// src/services/reminderQueue.js
// Postgres-backed queue for outbound Telegram notifications (daily digest, rate-limited).

import prisma from "./prisma.js";
import { JobStatus } from "@prisma/client";
import { getTotalForPeriod, getCategoryBreakdown } from "./transactionService.js";
import { morningYesterdayDigest } from "../utils/formatter.js";

/** One push per user: yesterday’s spending breakdown */
export const JOB_TYPE_YESTERDAY_DIGEST = "yesterday_spending_digest";

const MAX_SEND_ATTEMPTS = 3;
const BATCH_SIZE = 25;
/** Stay under Telegram ~30 msg/s */
const MESSAGE_GAP_MS = 40;
const STALE_PROCESSING_MS = 15 * 60 * 1000;

function startOfUtcDay() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Enqueue one morning digest job per user (deduped: no second pending/processing today).
 */
export async function enqueueYesterdayDigestJobs() {
  const users = await prisma.user.findMany({ select: { id: true } });
  const dayStart = startOfUtcDay();
  let enqueued = 0;

  for (const { id: userId } of users) {
    const existing = await prisma.scheduledJob.findFirst({
      where: {
        userId,
        jobType: JOB_TYPE_YESTERDAY_DIGEST,
        status: { in: [JobStatus.pending, JobStatus.processing] },
        createdAt: { gte: dayStart },
      },
    });
    if (existing) continue;

    await prisma.scheduledJob.create({
      data: {
        userId,
        jobType: JOB_TYPE_YESTERDAY_DIGEST,
        scheduledFor: new Date(),
        status: JobStatus.pending,
      },
    });
    enqueued += 1;
  }

  return { enqueued, users: users.length };
}

async function releaseStaleProcessingJobs() {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS);
  const res = await prisma.scheduledJob.updateMany({
    where: {
      status: JobStatus.processing,
      updatedAt: { lt: cutoff },
    },
    data: { status: JobStatus.pending },
  });
  if (res.count > 0) {
    console.log(`[QUEUE] Released ${res.count} stale processing job(s) back to pending.`);
  }
}

async function claimJobs(batchSize) {
  return prisma.$transaction(async (tx) => {
    const pending = await tx.scheduledJob.findMany({
      where: {
        status: JobStatus.pending,
        scheduledFor: { lte: new Date() },
        jobType: JOB_TYPE_YESTERDAY_DIGEST,
      },
      orderBy: { id: "asc" },
      take: batchSize,
    });
    if (pending.length === 0) return [];

    await tx.scheduledJob.updateMany({
      where: { id: { in: pending.map((j) => j.id) } },
      data: { status: JobStatus.processing },
    });
    return pending;
  });
}

async function finalizeJob(jobId, data) {
  await prisma.scheduledJob.update({
    where: { id: jobId },
    data,
  });
}

async function processYesterdayDigestJob(bot, job) {
  const user = await prisma.user.findUnique({ where: { id: job.userId } });
  if (!user) {
    await finalizeJob(job.id, {
      status: JobStatus.failed,
      lastError: "User not found",
      attempts: { increment: 1 },
    });
    return;
  }

  const period = "yesterday";
  const [totalData, breakdown] = await Promise.all([
    getTotalForPeriod(user.id, period),
    getCategoryBreakdown(user.id, period),
  ]);

  const text = morningYesterdayDigest(totalData, breakdown, {
    firstName: user.firstName,
    username: user.username,
  });

  try {
    await bot.telegram.sendMessage(user.telegramId.toString(), text, {
      parse_mode: "Markdown",
    });
    await finalizeJob(job.id, { status: JobStatus.done, lastError: null });
  } catch (err) {
    const msg = err?.message ?? String(err);
    const nextAttempts = job.attempts + 1;
    if (nextAttempts >= MAX_SEND_ATTEMPTS) {
      await prisma.scheduledJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.failed,
          attempts: nextAttempts,
          lastError: msg,
        },
      });
    } else {
      await prisma.scheduledJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.pending,
          attempts: nextAttempts,
          lastError: msg,
        },
      });
    }
    console.warn(`[QUEUE] Send failed job ${job.id} (attempt ${nextAttempts}):`, msg);
  }
}

/**
 * One worker tick: stale recovery, claim batch, send with rate limit.
 * @param {import('telegraf').Telegraf} bot
 */
export async function runReminderWorkerTick(bot) {
  await releaseStaleProcessingJobs();

  const jobs = await claimJobs(BATCH_SIZE);
  if (jobs.length === 0) return { processed: 0 };

  let processed = 0;
  for (const job of jobs) {
    if (job.jobType === JOB_TYPE_YESTERDAY_DIGEST) {
      await processYesterdayDigestJob(bot, job);
      processed += 1;
      await delay(MESSAGE_GAP_MS);
    } else {
      await finalizeJob(job.id, {
        status: JobStatus.failed,
        lastError: `Unknown job_type: ${job.jobType}`,
      });
    }
  }

  return { processed };
}

export { BATCH_SIZE, MESSAGE_GAP_MS };
