// src/handlers/messageHandler.js
// Central dispatcher: NLP intent → service call → formatted reply

import { parseIntent } from "../services/nlp.js";
import { upsertUser } from "../services/userService.js";
import { logExpense, getTotalForPeriod, getCategoryBreakdown } from "../services/transactionService.js";
import {
  recordDebt,
  settleDebt,
  getLentDebts,
  getBorrowedDebts,
  getDebtsByPerson,
} from "../services/debtService.js";
import { setBudget, getBudgetStatus, checkBudgetAlerts } from "../services/budgetService.js";
import { exportTransactionsCSV, exportDebtsCSV } from "../services/exportService.js";
import {
  expenseLogged,
  debtLogged,
  debtSettled,
  expenseSummary,
  debtList,
  monthlySummary,
  budgetSet,
  budgetStatusReport,
  budgetAlert,
  undoTransactionKeyboard,
  undoDebtKeyboard,
  UNKNOWN_MSG,
  ERROR_MSG,
  fmt,
} from "../utils/formatter.js";

/**
 * Main message handler. Called for every text message the bot receives.
 * @param {import('telegraf').Context} ctx
 */
export async function handleMessage(ctx) {
  const text = ctx.message?.text;
  if (!text || text.startsWith("/")) return;

  await ctx.sendChatAction("typing");

  try {
    const user = await upsertUser(ctx);
    const intent = await parseIntent(text);
    console.log(`[MSG] User ${user.telegramId} | Intent: ${intent.action}`, intent);

    switch (intent.action) {
      case "EXPENSE":
        return await handleExpense(ctx, user, intent);
      case "LENT":
        return await handleDebt(ctx, user, intent, "LENT");
      case "BORROWED":
        return await handleDebt(ctx, user, intent, "BORROWED");
      case "SETTLE_DEBT":
        return await handleSettle(ctx, user, intent);
      case "QUERY_EXPENSES":
        return await handleQueryExpenses(ctx, user, intent);
      case "QUERY_DEBTS":
        return await handleQueryDebts(ctx, user);
      case "QUERY_PERSON_DEBT":
        return await handleQueryPersonDebt(ctx, user, intent);
      case "SUMMARY":
        return await handleSummary(ctx, user, intent);
      case "SET_BUDGET":
        return await handleSetBudget(ctx, user, intent);
      case "QUERY_BUDGET":
        return await handleQueryBudget(ctx, user);
      case "EXPORT":
        return await handleExport(ctx, user, intent);
      default:
        await ctx.replyWithMarkdown(UNKNOWN_MSG);
    }
  } catch (err) {
    console.error("[MSG] Unhandled error:", err);
    await ctx.reply(ERROR_MSG);
  }
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function handleExpense(ctx, user, intent) {
  if (!intent.amount || intent.amount <= 0) {
    return ctx.reply(
      "I couldn't detect the amount. Try: 'Spent 200 on lunch'"
    );
  }

  const transaction = await logExpense(user.id, intent);
  const monthly = await getTotalForPeriod(user.id, "this_month");

  await ctx.replyWithMarkdown(expenseLogged(transaction, monthly.total), {
    reply_markup: undoTransactionKeyboard(transaction.id),
  });

  // Fire budget alerts if any thresholds are crossed
  const alerts = await checkBudgetAlerts(user.id);
  const alertMsg = budgetAlert(alerts);
  if (alertMsg) await ctx.replyWithMarkdown(alertMsg);
}

async function handleDebt(ctx, user, intent, direction) {
  if (!intent.amount || intent.amount <= 0) {
    return ctx.reply("I couldn't detect the amount. Try: 'Lent 500 to Rahul'");
  }
  if (!intent.person) {
    return ctx.reply(
      "Who did you lend/borrow from? Try: 'Lent 500 to Rahul'"
    );
  }

  const debt = await recordDebt(user.id, intent, direction);
  await ctx.replyWithMarkdown(debtLogged(debt), {
    reply_markup: undoDebtKeyboard(debt.id),
  });
}

async function handleSettle(ctx, user, intent) {
  if (!intent.person) {
    return ctx.reply("Who settled up? Try: 'Rahul paid me back 500'");
  }

  let amount = intent.amount;
  if (amount != null && amount !== "") {
    const n = Number(amount);
    if (Number.isNaN(n) || n < 0) {
      return ctx.reply(
        "Use a positive amount (e.g. 'Rushi paid me back 500') or say 'Settle with Rushi' to clear all debt with them."
      );
    }
    amount = n;
  }

  const result = await settleDebt(user.id, intent.person, amount);

  if (result.settled) {
    await ctx.replyWithMarkdown(debtSettled(intent.person, result.amountSettled));
  } else {
    await ctx.reply(`I couldn't find an active debt with ${intent.person}.`);
  }
}

async function handleQueryExpenses(ctx, user, intent) {
  const period = intent.period ?? "this_month";
  const category =
    intent.category && String(intent.category).trim()
      ? String(intent.category).trim()
      : null;
  const noteSearch =
    intent.note && String(intent.note).trim()
      ? String(intent.note).trim()
      : null;

  const filterOpts = {};
  if (category) filterOpts.category = category;
  if (noteSearch) filterOpts.noteContains = noteSearch;

  const narrowFilter = Boolean(category || noteSearch);

  const [totalData, fullBreakdown] = await Promise.all([
    getTotalForPeriod(user.id, period, filterOpts),
    narrowFilter ? Promise.resolve(null) : getCategoryBreakdown(user.id, period),
  ]);

  let breakdown;
  if (category && noteSearch) {
    breakdown =
      totalData.total > 0
        ? [
            {
              category: `${category} · "${noteSearch}"`,
              total: totalData.total,
              count: totalData.count,
            },
          ]
        : [];
  } else if (category != null) {
    breakdown =
      totalData.total > 0
        ? [{ category, total: totalData.total, count: totalData.count }]
        : [];
  } else if (noteSearch != null) {
    breakdown =
      totalData.total > 0
        ? [
            {
              category: `Notes matching "${noteSearch}"`,
              total: totalData.total,
              count: totalData.count,
            },
          ]
        : [];
  } else {
    breakdown = fullBreakdown;
  }

  await ctx.replyWithMarkdown(expenseSummary(totalData, breakdown));
}

async function handleQueryDebts(ctx, user) {
  const [lent, borrowed] = await Promise.all([
    getLentDebts(user.id),
    getBorrowedDebts(user.id),
  ]);
  await ctx.replyWithMarkdown(debtList(lent, borrowed));
}

async function handleQueryPersonDebt(ctx, user, intent) {
  if (!intent.person) {
    return handleQueryDebts(ctx, user);
  }

  const debts = await getDebtsByPerson(user.id, intent.person);
  if (!debts.length) {
    return ctx.reply(`No active debts with ${intent.person}.`);
  }

  const total = debts.reduce((s, d) => s + Number(d.amount), 0);
  const name = intent.person;
  const line =
    total > 0
      ? `${name} owes you *${fmt(total)}*`
      : total < 0
        ? `You owe ${name} *${fmt(Math.abs(total))}*`
        : `No net balance with ${name}.`;

  await ctx.replyWithMarkdown(line);
}

async function handleSummary(ctx, user, intent) {
  const period = intent.period ?? "this_month";
  const [totalData, breakdown, lent, borrowed] = await Promise.all([
    getTotalForPeriod(user.id, period),
    getCategoryBreakdown(user.id, period),
    getLentDebts(user.id),
    getBorrowedDebts(user.id),
  ]);
  await ctx.replyWithMarkdown(
    monthlySummary(period, totalData, breakdown, lent, borrowed)
  );
}

async function handleSetBudget(ctx, user, intent) {
  if (!intent.amount || intent.amount <= 0) {
    return ctx.reply(
      "Please specify an amount. Try: 'Set budget 3000 for Food'"
    );
  }
  if (!intent.category) {
    return ctx.reply(
      "Which category? Try: 'Set budget 3000 for Transport'"
    );
  }

  const budget = await setBudget(user.id, intent.category, intent.amount);
  await ctx.replyWithMarkdown(budgetSet(budget.category, Number(budget.limitAmount)));
}

async function handleQueryBudget(ctx, user) {
  const statuses = await getBudgetStatus(user.id);
  await ctx.replyWithMarkdown(budgetStatusReport(statuses));
}

async function handleExport(ctx, user, intent) {
  await ctx.sendChatAction("upload_document");

  // note field is "debts" when user asks for debt export, else transactions
  const wantsDebts = intent.note?.toLowerCase().includes("debt");

  if (wantsDebts) {
    const { csv, filename, count } = await exportDebtsCSV(user.id);
    if (count === 0) return ctx.reply("No active debts to export.");
    await ctx.replyWithDocument(
      { source: Buffer.from(csv, "utf-8"), filename },
      { caption: `*Active debts* · ${count} rows`, parse_mode: "Markdown" }
    );
  } else {
    const period = intent.period ?? "this_month";
    const { csv, filename, count } = await exportTransactionsCSV(user.id, period);
    if (count === 0) return ctx.reply("No transactions in that period.");
    await ctx.replyWithDocument(
      { source: Buffer.from(csv, "utf-8"), filename },
      { caption: `*Expenses* · ${count} rows`, parse_mode: "Markdown" }
    );
  }
}
