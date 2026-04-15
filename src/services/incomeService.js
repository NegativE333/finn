// src/services/incomeService.js
// Income ledger: manual entries + automatic monthly salary credits.

import prisma from "./prisma.js";
import { getPeriodRange } from "../utils/dateUtils.js";
import { salaryIncomeAutoMessage } from "../utils/formatter.js";

export async function getTotalIncomeForPeriod(userId, period = "this_month") {
  const { start, end } = getPeriodRange(period);

  const result = await prisma.income.aggregate({
    where: { userId, timestamp: { gte: start, lte: end } },
    _sum: { amount: true },
    _count: true,
  });

  return {
    total: Number(result._sum.amount ?? 0),
    count: result._count,
    period,
    start,
    end,
  };
}

export async function createManualIncome(userId, amount, note = null) {
  return prisma.income.create({
    data: {
      userId,
      amount,
      source: "other",
      note: note?.trim() || null,
    },
  });
}

export async function createSalaryIncome(userId, amount, note = null) {
  return prisma.income.create({
    data: {
      userId,
      amount,
      source: "salary",
      note: note?.trim() || null,
    },
  });
}

function hasSalaryConfigured(user) {
  return Number(user?.monthlySalary ?? 0) > 0 && Number(user?.salaryCreditDay ?? 0) >= 1;
}

function getYMDInTimeZone(date, timeZone) {
  const d = new Date(date);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return { year: y, month: m, day };
}

function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

/**
 * On the user's salary credit calendar day (in SALARY_CREDIT_TZ, default Asia/Kolkata),
 * record monthly salary once per calendar month (same window as spending summary).
 */
export async function tryCreditMonthlySalary(user) {
  if (!hasSalaryConfigured(user)) {
    return { credited: false, reason: "no_config" };
  }

  const tz = process.env.SALARY_CREDIT_TZ ?? "Asia/Kolkata";
  const now = new Date();
  const { year, month, day: dayInTz } = getYMDInTimeZone(now, tz);
  const dim = daysInMonth(year, month);
  const targetDay = Number(user.salaryCreditDay);
  const effectiveDay = Math.min(targetDay, dim);
  if (dayInTz !== effectiveDay) {
    return { credited: false, reason: "not_salary_day" };
  }

  const { start, end } = getPeriodRange("this_month");
  const existing = await prisma.income.findFirst({
    where: {
      userId: user.id,
      source: "salary",
      timestamp: { gte: start, lte: end },
    },
  });
  if (existing) {
    return { credited: false, reason: "already_credited" };
  }

  const amt = Number(user.monthlySalary);
  const income = await createSalaryIncome(user.id, amt, "Monthly salary (auto)");
  return { credited: true, reason: "ok", income };
}

/**
 * Daily job: credit salary for every user whose payday is today (in SALARY_CREDIT_TZ).
 * Sends a Telegram DM when a row is created.
 * @param {import('telegraf').Telegraf} bot
 */
export async function processSalaryCreditsForAllUsers(bot) {
  const users = await prisma.user.findMany({
    where: {
      monthlySalary: { gt: 0 },
      NOT: { salaryCreditDay: null },
    },
  });

  let creditedCount = 0;
  for (const user of users) {
    const r = await tryCreditMonthlySalary(user);
    if (r.credited && r.income && bot) {
      creditedCount += 1;
      try {
        await bot.telegram.sendMessage(
          user.telegramId.toString(),
          salaryIncomeAutoMessage(Number(user.monthlySalary)),
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        console.warn(`[INCOME] Salary notify failed for user ${user.id}:`, err?.message ?? err);
      }
    }
  }

  return { checked: users.length, credited: creditedCount };
}

export async function deleteIncomeForUser(incomeId, userId) {
  const row = await prisma.income.findFirst({
    where: { id: incomeId, userId },
  });
  if (!row) return null;
  await prisma.income.delete({ where: { id: incomeId } });
  return row;
}
