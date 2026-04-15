// src/handlers/commandHandlers.js
// Handles slash commands: /start, /help, /summary, /debts, /week, /budget, /export

import { upsertUser } from "../services/userService.js";
import { getTotalForPeriod, getCategoryBreakdown } from "../services/transactionService.js";
import { getTotalIncomeForPeriod } from "../services/incomeService.js";
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
    `Hello *${name}*,\n\n` +
    `I'm *Finn*, your finance assistant. You can type in plain language, for example:\n` +
    `• Spent 300 on groceries\n` +
    `• Lent 1000 to Riya for dinner\n` +
    `• How much did I spend this week?\n` +
    `• Who owes me money?\n` +
    `• Set budget 5000 for Food\n\n` +
    `Use /help for commands and examples.`
  );
}

// ── /help ─────────────────────────────────────────────────────────────────────
export async function handleHelp(ctx) {
  await ctx.replyWithMarkdown(
    `*Finn · Help*\n\n` +
    `*Logging*\n` +
    `• Spent [amount] on [thing]\n` +
    `• Paid [amount] for [thing]\n` +
    `• Lent [amount] to [name]\n` +
    `• Borrowed [amount] from [name]\n` +
    `• [name] paid me back [amount]\n\n` +
    `*Queries*\n` +
    `• How much did I spend today / this week / this month?\n` +
    `• Received 5000 freelance / how much income this month?\n` +
    `• Who owes me money? / What do I owe?\n` +
    `• Show my budgets\n\n` +
    `*Budgets*\n` +
    `• Set budget 3000 for Food\n` +
    `• Set budget 2000 for Transport\n\n` +
    `*Commands*\n` +
    `/summary — Full summary (this month)\n` +
    `/week — This week's spending\n` +
    `/debts — Outstanding debts\n` +
    `/budget — Budgets and status\n` +
    `/export — CSV of this month's expenses\n` +
    `/exportdebts — CSV of active debts\n` +
    `/help — This message`
  );
}

// ── /summary ──────────────────────────────────────────────────────────────────
export async function handleSummaryCommand(ctx) {
  const user = await upsertUser(ctx);
  const period = "this_month";

  const [totalData, breakdown, lent, borrowed, incomeData] = await Promise.all([
    getTotalForPeriod(user.id, period),
    getCategoryBreakdown(user.id, period),
    getLentDebts(user.id),
    getBorrowedDebts(user.id),
    getTotalIncomeForPeriod(user.id, period),
  ]);

  await ctx.replyWithMarkdown(
    monthlySummary(period, totalData, breakdown, lent, borrowed, {
      incomeTotal: incomeData.total,
      monthlySalary: user.monthlySalary != null ? Number(user.monthlySalary) : null,
      salaryCreditDay: user.salaryCreditDay,
    })
  );
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
    return ctx.reply("No transactions this month to export.");
  }

  await ctx.replyWithDocument(
    { source: Buffer.from(csv, "utf-8"), filename },
    {
      caption: `*Expenses (this month)* · ${count} rows`,
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
    return ctx.reply("No active debts to export.");
  }

  await ctx.replyWithDocument(
    { source: Buffer.from(csv, "utf-8"), filename },
    {
      caption: `*Active debts* · ${count} rows`,
      parse_mode: "Markdown",
    }
  );
}
