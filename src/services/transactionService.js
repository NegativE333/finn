// src/services/transactionService.js
// All expense / transaction database operations

import prisma from "./prisma.js";
import { getPeriodRange } from "../utils/dateUtils.js";

/**
 * When the user says an expense happened on a past day (e.g. "yesterday"), store a
 * timestamp inside that calendar window so queries by period match.
 * @param {string | null | undefined} period - from NLP intent.period
 * @returns {Date | undefined} If undefined, Prisma uses default `now()`.
 */
function expenseTimestampFromPeriod(period) {
  if (period == null || typeof period !== "string") return undefined;
  const p = period.trim();
  if (p === "yesterday") {
    const { start, end } = getPeriodRange("yesterday");
    return new Date(Math.floor((start.getTime() + end.getTime()) / 2));
  }
  if (p === "today") {
    return new Date();
  }
  return undefined;
}

/**
 * intent.spent_on from NLP: ISO "YYYY-MM-DD" (e.g. "on 10 April"). Stored as local noon.
 * @param {string | null | undefined} spentOn
 * @returns {Date | undefined}
 */
function expenseTimestampFromSpentOn(spentOn) {
  if (spentOn == null || typeof spentOn !== "string") return undefined;
  const t = spentOn.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return undefined;
  const [y, m, d] = t.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return undefined;
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return undefined;
  return dt;
}

/** Explicit calendar date beats relative period. */
function expenseTimestampFromIntent(intent) {
  const fromSpentOn = expenseTimestampFromSpentOn(intent.spent_on);
  if (fromSpentOn != null) return fromSpentOn;
  return expenseTimestampFromPeriod(intent.period);
}

/**
 * Log a new expense transaction.
 * @param {number} userId  - Internal DB user ID
 * @param {object} intent  - Parsed NLP intent
 */
export async function logExpense(userId, intent) {
  const timestamp = expenseTimestampFromIntent(intent);

  return prisma.transaction.create({
    data: {
      userId,
      amount: intent.amount,
      category: intent.category ?? "Other",
      note: intent.note ?? null,
      ...(timestamp != null ? { timestamp } : {}),
    },
  });
}

/**
 * Get total spending for a given period.
 * @param {number} userId
 * @param {string} period  - e.g. "today", "this_month", "last_7_days"
 * @param {{ category?: string, noteContains?: string }} [options]  - optional filters
 */
export async function getTotalForPeriod(userId, period = "this_month", options = {}) {
  const { start, end } = getPeriodRange(period);

  const where = { userId, timestamp: { gte: start, lte: end } };
  if (options.category) {
    where.category = { equals: options.category, mode: "insensitive" };
  }
  if (options.noteContains) {
    const q = String(options.noteContains).trim();
    if (q) {
      where.note = { contains: q, mode: "insensitive" };
    }
  }

  const result = await prisma.transaction.aggregate({
    where,
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

/**
 * Get a breakdown by category for a given period.
 * @param {number} userId
 * @param {string} period
 */
export async function getCategoryBreakdown(userId, period = "this_month") {
  const { start, end } = getPeriodRange(period);

  const rows = await prisma.transaction.groupBy({
    by: ["category"],
    where: { userId, timestamp: { gte: start, lte: end } },
    _sum: { amount: true },
    _count: true,
    orderBy: { _sum: { amount: "desc" } },
  });

  return rows.map((r) => ({
    category: r.category,
    total: Number(r._sum.amount ?? 0),
    count: r._count,
  }));
}

/**
 * Get recent transactions for a period (up to 10).
 * @param {number} userId
 * @param {string} period
 */
export async function getRecentTransactions(userId, period = "today") {
  const { start, end } = getPeriodRange(period);

  return prisma.transaction.findMany({
    where: { userId, timestamp: { gte: start, lte: end } },
    orderBy: { timestamp: "desc" },
    take: 10,
  });
}
