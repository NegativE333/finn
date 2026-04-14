// src/services/salaryService.js
// Salary setup + non-blocking contextual salary nudges.

import prisma from "./prisma.js";

export const SALARY_NUDGE_TRIGGERS = {
  expense: "expense_nudge",
  summary: "summary_nudge",
  monthStart: "month_start_nudge",
};

/** Serializes salary nudge decisions per user in this process. */
const userNudgeLock = new Map();

function withUserNudgeLock(userId, fn) {
  const key = String(userId);
  const prev = userNudgeLock.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  userNudgeLock.set(
    key,
    next.finally(() => {
      if (userNudgeLock.get(key) === next) userNudgeLock.delete(key);
    })
  );
  return next;
}

function hasSalaryConfigured(user) {
  return Number(user?.monthlySalary ?? 0) > 0 && Number(user?.salaryCreditDay ?? 0) >= 1;
}

function normalizeNudges(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function sameUtcDay(a, b) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function shouldSendSalaryNudge(user, triggerKey) {
  if (hasSalaryConfigured(user)) return false;

  const shown = normalizeNudges(user.nudgesShown);
  if (shown[triggerKey] === true) return false;

  if (user.lastNudgeAt) {
    const last = new Date(user.lastNudgeAt);
    if (!Number.isNaN(last.getTime()) && sameUtcDay(last, new Date())) {
      return false;
    }
  }

  return true;
}

async function markNudgeShown(user, triggerKey) {
  const shown = normalizeNudges(user.nudgesShown);
  const next = { ...shown, [triggerKey]: true };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      nudgesShown: next,
      lastNudgeAt: new Date(),
    },
  });

  user.nudgesShown = next;
  user.lastNudgeAt = new Date();
}

/**
 * Non-blocking in-chat nudge (expense/summary moments).
 */
export async function maybeSendSalaryNudgeInChat(ctx, user, triggerKey, text) {
  return withUserNudgeLock(user.id, async () => {
    if (!shouldSendSalaryNudge(user, triggerKey)) return false;
    await ctx.reply(text);
    await markNudgeShown(user, triggerKey);
    return true;
  });
}

/**
 * Monthly proactive nudge sent by scheduler (bot context, not chat handler).
 */
export async function maybeSendSalaryNudgeByBot(bot, user, triggerKey, text) {
  return withUserNudgeLock(user.id, async () => {
    if (!shouldSendSalaryNudge(user, triggerKey)) return false;
    await bot.telegram.sendMessage(user.telegramId.toString(), text);
    await markNudgeShown(user, triggerKey);
    return true;
  });
}

/**
 * Save salary setup. Clearing nudge JSON prevents future reminders.
 */
export async function setSalaryConfig(userId, amount, creditDay) {
  const normalizedDay = Math.max(1, Math.min(31, Number(creditDay)));
  return prisma.user.update({
    where: { id: userId },
    data: {
      monthlySalary: amount,
      salaryCreditDay: normalizedDay,
      nudgesShown: {},
      lastNudgeAt: null,
    },
  });
}

export async function sendMonthStartSalaryNudges(bot, text) {
  const users = await prisma.user.findMany({
    where: {
      OR: [{ monthlySalary: null }, { salaryCreditDay: null }],
    },
  });

  let sent = 0;
  for (const user of users) {
    try {
      const didSend = await maybeSendSalaryNudgeByBot(
        bot,
        user,
        SALARY_NUDGE_TRIGGERS.monthStart,
        text
      );
      if (didSend) sent += 1;
    } catch (err) {
      console.warn(`[SALARY] Month-start nudge failed for user ${user.id}:`, err?.message ?? err);
    }
  }

  return { scanned: users.length, sent };
}

export { hasSalaryConfigured };
