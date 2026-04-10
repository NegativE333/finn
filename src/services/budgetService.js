// src/services/budgetService.js
// Per-category monthly budget tracking

import prisma from "./prisma.js";
import { getTotalForPeriod, getCategoryBreakdown } from "./transactionService.js";

/**
 * Set or update a budget for a category.
 * @param {number} userId
 * @param {string} category
 * @param {number} limitAmount
 */
export async function setBudget(userId, category, limitAmount) {
  return prisma.budget.upsert({
    where: { userId_category: { userId, category } },
    update: { limitAmount },
    create: { userId, category, limitAmount },
  });
}

/**
 * Get all budgets for a user.
 * @param {number} userId
 */
export async function getBudgets(userId) {
  return prisma.budget.findMany({
    where: { userId },
    orderBy: { category: "asc" },
  });
}

/**
 * Delete a budget for a category.
 * @param {number} userId
 * @param {string} category
 */
export async function deleteBudget(userId, category) {
  return prisma.budget.deleteMany({
    where: { userId, category: { equals: category, mode: "insensitive" } },
  });
}

/**
 * Check all budgets against current spending and return alerts for those exceeded or close (>80%).
 * @param {number} userId
 * @returns {Promise<Array<{ category, spent, limit, pct, status }>>}
 */
export async function checkBudgetAlerts(userId) {
  const [budgets, breakdown] = await Promise.all([
    getBudgets(userId),
    getCategoryBreakdown(userId, "this_month"),
  ]);

  if (!budgets.length) return [];

  const spendMap = new Map(breakdown.map((b) => [b.category, b.total]));
  const alerts = [];

  for (const budget of budgets) {
    const spent = spendMap.get(budget.category) ?? 0;
    const limit = Number(budget.limitAmount);
    const pct = limit > 0 ? (spent / limit) * 100 : 0;

    if (pct >= 80) {
      alerts.push({
        category: budget.category,
        spent,
        limit,
        pct: Math.round(pct),
        status: pct >= 100 ? "EXCEEDED" : "WARNING",
      });
    }
  }

  return alerts;
}

/**
 * Get a full budget status report for all categories.
 * @param {number} userId
 */
export async function getBudgetStatus(userId) {
  const [budgets, breakdown] = await Promise.all([
    getBudgets(userId),
    getCategoryBreakdown(userId, "this_month"),
  ]);

  const spendMap = new Map(breakdown.map((b) => [b.category, b.total]));

  return budgets.map((budget) => {
    const spent = spendMap.get(budget.category) ?? 0;
    const limit = Number(budget.limitAmount);
    const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    return {
      category: budget.category,
      spent,
      limit,
      pct,
      remaining: Math.max(0, limit - spent),
      status: pct >= 100 ? "EXCEEDED" : pct >= 80 ? "WARNING" : "OK",
    };
  });
}
