// src/services/transactionService.js
// All expense / transaction database operations

import prisma from "./prisma.js";
import { getPeriodRange } from "../utils/dateUtils.js";

/**
 * Log a new expense transaction.
 * @param {number} userId  - Internal DB user ID
 * @param {object} intent  - Parsed NLP intent
 */
export async function logExpense(userId, intent) {
  return prisma.transaction.create({
    data: {
      userId,
      amount: intent.amount,
      category: intent.category ?? "Other",
      note: intent.note ?? null,
    },
  });
}

/**
 * Get total spending for a given period.
 * @param {number} userId
 * @param {string} period  - e.g. "today", "this_month", "last_7_days"
 * @param {{ category?: string }} [options]  - optional exact category filter
 */
export async function getTotalForPeriod(userId, period = "this_month", options = {}) {
  const { start, end } = getPeriodRange(period);

  const where = { userId, timestamp: { gte: start, lte: end } };
  if (options.category) {
    where.category = { equals: options.category, mode: "insensitive" };
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
