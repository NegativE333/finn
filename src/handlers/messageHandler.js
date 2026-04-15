// src/handlers/messageHandler.js
// Central dispatcher: NLP intent → service call → formatted reply

import { parseIntent } from "../services/nlp.js";
import { upsertUser } from "../services/userService.js";
import { logExpense, getTotalForPeriod, getCategoryBreakdown } from "../services/transactionService.js";
import {
  getTotalIncomeForPeriod,
  createManualIncome,
  tryCreditMonthlySalary,
} from "../services/incomeService.js";
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
  maybeSendSalaryNudgeInChat,
  SALARY_NUDGE_TRIGGERS,
  setSalaryConfig,
} from "../services/salaryService.js";
import {
  MAX_USER_MESSAGE_CHARS,
  NLP_SLOW_NOTICE_AFTER_MS,
  NLP_TYPING_KEEPALIVE_MS,
} from "../constants/limits.js";
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
  undoIncomeKeyboard,
  incomeLogged,
  incomeQuerySummary,
  salaryIncomeAutoMessage,
  UNKNOWN_MSG,
  ERROR_MSG,
  NLP_RETRY_NOTICE_MSG,
  SALARY_NUDGE_EXPENSE_MSG,
  SALARY_NUDGE_SUMMARY_MSG,
  SALARY_DAY_MISSING_MSG,
  salarySetConfirmation,
  messageTooLongRejection,
  fmt,
} from "../utils/formatter.js";

async function sendSalaryNudgeSafe(ctx, user, trigger, text) {
  try {
    await maybeSendSalaryNudgeInChat(ctx, user, trigger, text);
  } catch (err) {
    console.warn("[MSG] Salary nudge failed:", err?.message ?? err);
  }
}

/**
 * Main message handler. Called for every text message the bot receives.
 * @param {import('telegraf').Context} ctx
 */
export async function handleMessage(ctx) {
  const text = ctx.message?.text;
  if (!text || text.startsWith("/")) return;

  const limit = MAX_USER_MESSAGE_CHARS;
  if (text.length > limit) {
    console.warn(
      `[MSG] Rejected oversize message (${text.length} chars > ${limit}) from ${ctx.from?.id}`
    );
    return ctx.reply(messageTooLongRejection(limit));
  }

  await ctx.sendChatAction("typing");

  try {
    const user = await upsertUser(ctx);

    const pendingSalaryAmount = Number(ctx.session?.pendingSalaryAmount ?? 0);
    const dayFromFollowUp = parseSalaryDayInput(text);
    if (pendingSalaryAmount > 0 && dayFromFollowUp != null) {
      const updated = await setSalaryConfig(user.id, pendingSalaryAmount, dayFromFollowUp);
      if (ctx.session) delete ctx.session.pendingSalaryAmount;
      await ctx.replyWithMarkdown(
        salarySetConfirmation(Number(updated.monthlySalary), updated.salaryCreditDay)
      );
      const credit = await tryCreditMonthlySalary(updated);
      if (credit.credited) {
        await ctx.replyWithMarkdown(salaryIncomeAutoMessage(Number(updated.monthlySalary)));
      }
      return;
    }

    await ctx.sendChatAction("typing");

    const chatId = ctx.chat?.id;
    const replyToId = ctx.message?.message_id;

    let userWaitNotified = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let slowNoticeTimer = null;
    /** @type {ReturnType<typeof setInterval> | null} */
    let typingKeepAlive = null;

    const notifyWaitOnce = async (reason) => {
      if (userWaitNotified || chatId == null) return;
      userWaitNotified = true;
      if (slowNoticeTimer != null) {
        clearTimeout(slowNoticeTimer);
        slowNoticeTimer = null;
      }
      try {
        await ctx.telegram.sendChatAction(chatId, "typing");
        await ctx.telegram.sendMessage(chatId, NLP_RETRY_NOTICE_MSG, {
          ...(replyToId != null ? { reply_to_message_id: replyToId } : {}),
        });
        console.log(`[MSG] User wait notice (${reason})`);
      } catch (e) {
        console.warn("[MSG] wait notice failed:", e?.message ?? e);
      }
    };

    let intent;
    try {
      if (chatId != null) {
        typingKeepAlive = setInterval(() => {
          ctx.telegram.sendChatAction(chatId, "typing").catch(() => {});
        }, NLP_TYPING_KEEPALIVE_MS);
      }
      slowNoticeTimer = setTimeout(() => {
        slowNoticeTimer = null;
        void notifyWaitOnce("slow-first-response");
      }, NLP_SLOW_NOTICE_AFTER_MS);

      intent = await parseIntent(text, {
        onFirstRetryNotify: () => notifyWaitOnce("nlp-retry"),
      });
    } finally {
      if (slowNoticeTimer != null) {
        clearTimeout(slowNoticeTimer);
        slowNoticeTimer = null;
      }
      if (typingKeepAlive != null) {
        clearInterval(typingKeepAlive);
        typingKeepAlive = null;
      }
    }

    console.log(`[MSG] User ${user.telegramId} | Intent: ${intent.action}`, intent);

    switch (intent.action) {
      case "EXPENSE": {
        await handleExpense(ctx, user, intent);
        await sendSalaryNudgeSafe(
          ctx,
          user,
          SALARY_NUDGE_TRIGGERS.expense,
          SALARY_NUDGE_EXPENSE_MSG
        );
        return;
      }
      case "LENT":
        return await handleDebt(ctx, user, intent, "LENT");
      case "BORROWED":
        return await handleDebt(ctx, user, intent, "BORROWED");
      case "SETTLE_DEBT":
        return await handleSettle(ctx, user, intent);
      case "QUERY_EXPENSES": {
        await handleQueryExpenses(ctx, user, intent);
        const period = intent.period ?? "this_month";
        if (period === "this_month") {
          await sendSalaryNudgeSafe(
            ctx,
            user,
            SALARY_NUDGE_TRIGGERS.summary,
            SALARY_NUDGE_SUMMARY_MSG
          );
        }
        return;
      }
      case "QUERY_DEBTS":
        return await handleQueryDebts(ctx, user);
      case "QUERY_PERSON_DEBT":
        return await handleQueryPersonDebt(ctx, user, intent);
      case "SUMMARY":
        await handleSummary(ctx, user, intent);
        await sendSalaryNudgeSafe(
          ctx,
          user,
          SALARY_NUDGE_TRIGGERS.summary,
          SALARY_NUDGE_SUMMARY_MSG
        );
        return;
      case "ADD_INCOME":
        return await handleAddIncome(ctx, user, intent);
      case "QUERY_INCOME":
        return await handleQueryIncome(ctx, user, intent);
      case "SET_BUDGET":
        return await handleSetBudget(ctx, user, intent);
      case "QUERY_BUDGET":
        return await handleQueryBudget(ctx, user);
      case "EXPORT":
        return await handleExport(ctx, user, intent);
      case "SALARY_UPDATE":
        return await handleSalaryUpdate(ctx, user, intent);
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

function dayFromIntent(intent) {
  if (intent.salary_day != null && Number.isFinite(Number(intent.salary_day))) {
    return Number(intent.salary_day);
  }
  if (intent.due_date) {
    const d = new Date(intent.due_date);
    if (!Number.isNaN(d.getTime())) return d.getDate();
  }
  return null;
}

function parseSalaryDayInput(text) {
  const m = String(text).trim().match(/^(\d{1,2})(?:st|nd|rd|th)?$/i);
  if (!m) return null;
  const d = Number(m[1]);
  if (!Number.isInteger(d) || d < 1 || d > 31) return null;
  return d;
}

async function handleSalaryUpdate(ctx, user, intent) {
  if (!intent.amount || Number(intent.amount) <= 0) {
    return ctx.reply("Please share your monthly salary amount, e.g. 'my salary is 85000'.");
  }

  const salaryDay = dayFromIntent(intent);
  if (salaryDay == null) {
    if (ctx.session) {
      ctx.session.pendingSalaryAmount = Number(intent.amount);
    }
    return ctx.reply(SALARY_DAY_MISSING_MSG);
  }
  if (salaryDay < 1 || salaryDay > 31) {
    return ctx.reply("Salary credit date should be between 1 and 31.");
  }

  const updated = await setSalaryConfig(user.id, Number(intent.amount), salaryDay);
  if (ctx.session) delete ctx.session.pendingSalaryAmount;
  await ctx.replyWithMarkdown(
    salarySetConfirmation(Number(updated.monthlySalary), updated.salaryCreditDay)
  );

  const credit = await tryCreditMonthlySalary(updated);
  if (credit.credited) {
    await ctx.replyWithMarkdown(salaryIncomeAutoMessage(Number(updated.monthlySalary)));
  }
}

async function handleAddIncome(ctx, user, intent) {
  if (!intent.amount || intent.amount <= 0) {
    return ctx.reply('Say the amount, e.g. "received 5000 freelance" or "add income 2000".');
  }

  const income = await createManualIncome(
    user.id,
    Number(intent.amount),
    intent.note && String(intent.note).trim() ? String(intent.note).trim() : null
  );
  const monthly = await getTotalIncomeForPeriod(user.id, "this_month");
  await ctx.replyWithMarkdown(incomeLogged(income, monthly.total), {
    reply_markup: undoIncomeKeyboard(income.id),
  });
}

async function handleQueryIncome(ctx, user, intent) {
  const period = intent.period ?? "this_month";
  const data = await getTotalIncomeForPeriod(user.id, period);
  await ctx.replyWithMarkdown(incomeQuerySummary(period, data.total, data.count));
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
