// src/handlers/commandHandlers.js
// Handles slash commands: /start, /help, /summary, /debts, /week, /budget, /export

import { upsertUser } from "../services/userService.js";
import { getTotalForPeriod, getCategoryBreakdown } from "../services/transactionService.js";
import { getLentDebts, getBorrowedDebts } from "../services/debtService.js";
import { getBudgetStatus } from "../services/budgetService.js";
import { exportTransactionsCSV, exportDebtsCSV } from "../services/exportService.js";
import {
  debtList,
  monthlySummary,
  expenseSummary,
  budgetStatusReport,
} from "../utils/formatter.js";

// ── /start ────────────────────────────────────────────────────────────────────
export async function handleStart(ctx) {
  await upsertUser(ctx);
  const name = ctx.from.first_name ?? "there";

  await ctx.replyWithMarkdown(
    `👋 Hey *${name}*, I'm *Finn* — your personal finance assistant!\n\n` +
    `Just talk to me naturally:\n` +
    `• "Spent 300 on groceries"\n` +
    `• "Lent 1000 to Riya for dinner"\n` +
    `• "How much did I spend this week?"\n` +
    `• "Who owes me money?"\n` +
    `• "Set budget 5000 for Food"\n\n` +
    `Use /help for the full command list.`
  );
}

// ── /help ─────────────────────────────────────────────────────────────────────
export async function handleHelp(ctx) {
  await ctx.replyWithMarkdown(
    `📖 *Finn — Quick Reference*\n\n` +
    `*Logging*\n` +
    `• "Spent [amount] on [thing]"\n` +
    `• "Paid [amount] for [thing]"\n` +
    `• "Lent [amount] to [name]"\n` +
    `• "Borrowed [amount] from [name]"\n` +
    `• "[name] paid me back [amount]"\n\n` +
    `*Queries*\n` +
    `• "How much did I spend today/this week/this month?"\n` +
    `• "Who owes me money?" / "What do I owe?"\n` +
    `• "Show my budgets"\n\n` +
    `*Budgets*\n` +
    `• "Set budget 3000 for Food"\n` +
    `• "Set budget 2000 for Transport"\n\n` +
    `*Commands*\n` +
    `/summary — This month's full summary\n` +
    `/week — This week's spending\n` +
    `/debts — All pending debts\n` +
    `/budget — View all budgets & status\n` +
    `/export — Download this month's expenses as CSV\n` +
    `/exportdebts — Download all active debts as CSV\n` +
    `/help — This message`
  );
}

// ── /summary ──────────────────────────────────────────────────────────────────
export async function handleSummaryCommand(ctx) {
  const user = await upsertUser(ctx);
  const period = "this_month";

  const [totalData, breakdown, lent, borrowed] = await Promise.all([
    getTotalForPeriod(user.id, period),
    getCategoryBreakdown(user.id, period),
    getLentDebts(user.id),
    getBorrowedDebts(user.id),
  ]);

  await ctx.replyWithMarkdown(monthlySummary(period, totalData, breakdown, lent, borrowed));
}

// ── /week ─────────────────────────────────────────────────────────────────────
export async function handleWeekCommand(ctx) {
  const user = await upsertUser(ctx);
  const period = "this_week";

  const [totalData, breakdown] = await Promise.all([
    getTotalForPeriod(user.id, period),
    getCategoryBreakdown(user.id, period),
  ]);

  await ctx.replyWithMarkdown(expenseSummary(totalData, breakdown));
}

// ── /debts ────────────────────────────────────────────────────────────────────
export async function handleDebtsCommand(ctx) {
  const user = await upsertUser(ctx);

  const [lent, borrowed] = await Promise.all([
    getLentDebts(user.id),
    getBorrowedDebts(user.id),
  ]);

  await ctx.replyWithMarkdown(debtList(lent, borrowed));
}

// ── /budget ───────────────────────────────────────────────────────────────────
export async function handleBudgetCommand(ctx) {
  const user = await upsertUser(ctx);
  const statuses = await getBudgetStatus(user.id);
  await ctx.replyWithMarkdown(budgetStatusReport(statuses));
}

// ── /export ───────────────────────────────────────────────────────────────────
export async function handleExportCommand(ctx) {
  const user = await upsertUser(ctx);
  await ctx.sendChatAction("upload_document");

  const { csv, filename, count } = await exportTransactionsCSV(user.id, "this_month");

  if (count === 0) {
    return ctx.reply("📭 No transactions this month to export.");
  }

  await ctx.replyWithDocument(
    { source: Buffer.from(csv, "utf-8"), filename },
    {
      caption: `📊 *This Month's Expenses* — ${count} transactions`,
      parse_mode: "Markdown",
    }
  );
}

// ── /exportdebts ──────────────────────────────────────────────────────────────
export async function handleExportDebtsCommand(ctx) {
  const user = await upsertUser(ctx);
  await ctx.sendChatAction("upload_document");

  const { csv, filename, count } = await exportDebtsCSV(user.id);

  if (count === 0) {
    return ctx.reply("🎉 No active debts to export.");
  }

  await ctx.replyWithDocument(
    { source: Buffer.from(csv, "utf-8"), filename },
    {
      caption: `💼 *Active Debts* — ${count} records`,
      parse_mode: "Markdown",
    }
  );
}
