// src/services/exportService.js
// Generates CSV exports for transactions and debts

import prisma from "./prisma.js";
import { getPeriodRange } from "../utils/dateUtils.js";

/**
 * Build a CSV string from an array of objects.
 * @param {string[]} headers
 * @param {Array<Record<string, any>>} rows
 */
function toCSV(headers, rows) {
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];
  return lines.join("\n");
}

/**
 * Export transactions for a given period as CSV.
 * @param {number} userId
 * @param {string} period
 * @returns {Promise<{ csv: string, filename: string, count: number }>}
 */
export async function exportTransactionsCSV(userId, period = "this_month") {
  const { start, end } = getPeriodRange(period);

  const rows = await prisma.transaction.findMany({
    where: { userId, timestamp: { gte: start, lte: end } },
    orderBy: { timestamp: "asc" },
  });

  const headers = ["Date", "Amount", "Category", "Note"];
  const data = rows.map((r) => ({
    Date: r.timestamp.toISOString().split("T")[0],
    Amount: Number(r.amount).toFixed(2),
    Category: r.category,
    Note: r.note ?? "",
  }));

  const periodSlug = period.replace(/_/g, "-");
  return {
    csv: toCSV(headers, data),
    filename: `finn-expenses-${periodSlug}.csv`,
    count: rows.length,
  };
}

/**
 * Export all active debts as CSV.
 * @param {number} userId
 * @returns {Promise<{ csv: string, filename: string, count: number }>}
 */
export async function exportDebtsCSV(userId) {
  const rows = await prisma.debt.findMany({
    where: { userId, isSettled: false },
    orderBy: { createdAt: "asc" },
  });

  const headers = ["Person", "Type", "Amount", "Note", "Due Date", "Created"];
  const data = rows.map((r) => ({
    Person: r.personName,
    Type: Number(r.amount) > 0 ? "Lent" : "Borrowed",
    Amount: Math.abs(Number(r.amount)).toFixed(2),
    Note: r.note ?? "",
    "Due Date": r.dueDate ? r.dueDate.toISOString().split("T")[0] : "",
    Created: r.createdAt.toISOString().split("T")[0],
  }));

  return {
    csv: toCSV(headers, data),
    filename: "finn-debts.csv",
    count: rows.length,
  };
}
