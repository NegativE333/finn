// src/utils/formatter.js
// User-facing message copy — clear structure, minimal decoration.

import { periodLabel, formatDate, getPeriodRange } from "./dateUtils.js";

const RUPEE = "₹";

export function fmt(amount) {
  return `${RUPEE}${Number(amount).toLocaleString("en-IN")}`;
}

function statusLabel(s) {
  if (s === "EXCEEDED") return "Over limit";
  if (s === "WARNING") return "Near limit";
  return "On track";
}

// ── Expense confirmations ─────────────────────────────────────────────────────

/**
 * @param {{ amount: unknown, category: string, note?: string | null }} transaction
 * @param {number} monthlyTotal
 */
function sameLocalCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function expenseLogged(transaction, monthlyTotal) {
  const amt = fmt(Number(transaction.amount));
  const cat = transaction.category;

  const lines = [`Got it — *${amt}* · ${cat}`];
  if (transaction.timestamp) {
    const ts = new Date(transaction.timestamp);
    if (!sameLocalCalendarDay(ts, new Date())) {
      lines.push(`_Booked for ${formatDate(ts)}_`);
    }
  }
  if (transaction.note) lines.push(`_${transaction.note}_`);
  lines.push("", `You're at *${fmt(monthlyTotal)}* spent this month.`);
  return lines.join("\n");
}

// ── Debt confirmations ────────────────────────────────────────────────────────

export function debtLogged(debt) {
  const isLent = Number(debt.amount) > 0;
  const absAmt = Math.abs(Number(debt.amount));
  const verb = isLent ? "Lent" : "Borrowed";
  const prep = isLent ? "to" : "from";

  const lines = [
    `*${verb}* ${fmt(absAmt)} ${prep} *${debt.personName}*`,
  ];
  if (debt.note) lines.push(`Note: _${debt.note}_`);
  if (debt.dueDate) lines.push(`Due: ${formatDate(debt.dueDate)}`);
  return lines.join("\n");
}

export function debtSettled(personName, amount) {
  return `*Settled* ${fmt(amount)} with *${personName}*.`;
}

// ── Query responses ───────────────────────────────────────────────────────────

export function expenseSummary(data, breakdown) {
  const label = periodLabel(data.period);
  if (data.total === 0) {
    return `No expenses recorded for *${label}*.`;
  }

  const lines = [
    `*Spending · ${label}*`,
    `Total: *${fmt(data.total)}*`,
    ``,
    ...breakdown.map(
      (b) => `• ${b.category}: *${fmt(b.total)}* (${b.count} transactions)`
    ),
  ];
  return lines.join("\n");
}

/** Telegram Markdown–safe display name for greetings (first name, else username without @). */
function safeDisplayName(firstName, username) {
  const raw =
    (firstName && String(firstName).trim()) ||
    (username && String(username).replace(/^@/, "").trim()) ||
    "";
  if (!raw) return null;
  const cleaned = raw.replace(/[*_`[\]]/g, "").trim().slice(0, 40);
  return cleaned || null;
}

/**
 * Scheduled morning digest: yesterday’s spending.
 * @param {{ total: number, count: number, period: string }} data
 * @param {Array<{ category: string, total: number, count: number }>} breakdown
 * @param {{ firstName?: string | null, username?: string | null }} [user]
 */
export function morningYesterdayDigest(data, breakdown, user = {}) {
  const { start } = getPeriodRange("yesterday");
  const dayLine = formatDate(start);

  const name = safeDisplayName(user.firstName, user.username);
  const greeting = name ? `Good morning, *${name}*` : `Good morning`;
  const headline = `Here's what you spent *yesterday*`;

  if (data.total === 0) {
    return (
      `${greeting}\n\n${headline}\n\n` +
      `You didn't log any expenses that day. If something's missing, just tell me — e.g. _Spent 150 on chai_.`
    );
  }

  const txnWord = data.count === 1 ? "transaction" : "transactions";
  const lines = [
    greeting,
    "",
    headline,
    "",
    `All in, you spent *${fmt(data.total)}* across *${breakdown.length}* categories (${data.count} ${txnWord}).`,
    "",
    `*Where it went*`,
    ...breakdown.map(
      (b) =>
        `• ${b.category} — *${fmt(b.total)}* (${b.count} ${b.count === 1 ? "txn" : "txns"})`
    ),
    "",
    `_Message me anytime to log or ask — I've got you._`,
  ];

  return lines.join("\n");
}

export function debtList(lentDebts, borrowedDebts) {
  const lines = [];

  if (lentDebts.length === 0 && borrowedDebts.length === 0) {
    return "No outstanding debts.";
  }

  if (lentDebts.length > 0) {
    const totalLent = lentDebts.reduce((s, d) => s + d.amount, 0);
    lines.push(`*Receivable · ${fmt(totalLent)} total*`);
    lentDebts.forEach((d) => {
      const due = d.dueDate ? ` · due ${formatDate(d.dueDate)}` : "";
      lines.push(`  • ${d.personName}: *${fmt(d.amount)}*${due}`);
    });
    lines.push("");
  }

  if (borrowedDebts.length > 0) {
    const totalBorrowed = borrowedDebts.reduce((s, d) => s + Math.abs(d.amount), 0);
    lines.push(`*Payable · ${fmt(totalBorrowed)} total*`);
    borrowedDebts.forEach((d) => {
      const due = d.dueDate ? ` · due ${formatDate(d.dueDate)}` : "";
      lines.push(`  • ${d.personName}: *${fmt(Math.abs(d.amount))}*${due}`);
    });
  }

  return lines.join("\n").trimEnd();
}

// ── Income ───────────────────────────────────────────────────────────────────

export function salaryIncomeAutoMessage(amount) {
  return `*Income*\nMonthly salary *${fmt(amount)}* was added for this month.`;
}

/**
 * @param {{ amount: unknown, source: string, note?: string | null }} income
 * @param {number} monthlyIncomeTotal
 */
export function incomeLogged(income, monthlyIncomeTotal) {
  const label = income.source === "salary" ? "Salary" : "Income";
  const lines = [`Recorded *${fmt(Number(income.amount))}* · ${label}`];
  if (income.note) lines.push(`_${income.note}_`);
  lines.push(``, `Total income this month: *${fmt(monthlyIncomeTotal)}*`);
  return lines.join("\n");
}

export function incomeQuerySummary(period, total, count) {
  const n = Number(count) || 0;
  return (
    `*Income · ${periodLabel(period)}*\n\n` +
    `Total: *${fmt(total)}* · ${n} ${n === 1 ? "entry" : "entries"}`
  );
}

// ── Monthly summary ───────────────────────────────────────────────────────────

/**
 * @param {{ incomeTotal?: number, monthlySalary?: number | null, salaryCreditDay?: number | null }} [incomeOpts]
 *        Income totals come from the income ledger; salary fields are only for a hint before the first auto-credit.
 */
export function monthlySummary(period, totalData, breakdown, lentDebts, borrowedDebts, incomeOpts = {}) {
  const incomeTotal = Number(incomeOpts.incomeTotal ?? 0);
  const monthlySalary = incomeOpts.monthlySalary != null ? Number(incomeOpts.monthlySalary) : null;
  const salaryCreditDay = incomeOpts.salaryCreditDay != null ? Number(incomeOpts.salaryCreditDay) : null;

  const label = periodLabel(period);
  const lines = [`*Summary · ${label}*`, ``];

  const showMoneyFlow = period === "this_month" || period === "last_month";

  if (showMoneyFlow) {
    const spent = totalData.total;
    const left = incomeTotal - spent;
    lines.push(
      `Total income: *${fmt(incomeTotal)}*`,
      `Spent (expenses): *${fmt(spent)}*`,
      left >= 0
        ? `Left after expenses: *${fmt(left)}*`
        : `Over your income by: *${fmt(Math.abs(left))}*`
    );
    if (
      period === "this_month" &&
      incomeTotal === 0 &&
      monthlySalary != null &&
      monthlySalary > 0 &&
      salaryCreditDay != null &&
      salaryCreditDay >= 1
    ) {
      lines.push(
        ``,
        `_Salary of ${fmt(monthlySalary)} is set to auto-add on the ${dayOrdinal(salaryCreditDay)}._`
      );
    }
  } else {
    lines.push(`Total spent: *${fmt(totalData.total)}*`);
  }

  if (breakdown.length > 0) {
    lines.push(``, `*By category*`);
    breakdown.forEach((b) => {
      const pct = totalData.total > 0
        ? ((b.total / totalData.total) * 100).toFixed(0)
        : 0;
      lines.push(`  ${b.category}: ${fmt(b.total)} (${pct}%)`);
    });
  }

  const totalLent = lentDebts.reduce((s, d) => s + d.amount, 0);
  const totalBorrowed = borrowedDebts.reduce((s, d) => s + Math.abs(d.amount), 0);

  if (totalLent > 0 || totalBorrowed > 0) {
    lines.push(``, `*Outstanding debt*`);
    if (totalLent > 0) lines.push(`  Others owe you: ${fmt(totalLent)}`);
    if (totalBorrowed > 0) lines.push(`  You owe: ${fmt(totalBorrowed)}`);
  }

  return lines.join("\n");
}

// ── Inline keyboards ──────────────────────────────────────────────────────────

/** Undo button for a just-logged transaction */
export function undoTransactionKeyboard(txnId) {
  return {
    inline_keyboard: [[{ text: "Undo", callback_data: `undo_txn:${txnId}` }]],
  };
}

/** Undo button for a just-logged income row */
export function undoIncomeKeyboard(incomeId) {
  return {
    inline_keyboard: [[{ text: "Undo", callback_data: `undo_income:${incomeId}` }]],
  };
}

/** Undo button for a just-logged debt */
export function undoDebtKeyboard(debtId) {
  return {
    inline_keyboard: [[{ text: "Undo", callback_data: `undo_debt:${debtId}` }]],
  };
}

/** Delete budget button */
export function deleteBudgetKeyboard(category) {
  return {
    inline_keyboard: [
      [{ text: "Remove budget", callback_data: `del_budget:${category}` }],
      [{ text: "Dismiss", callback_data: "dismiss" }],
    ],
  };
}

// ── Budget formatting ─────────────────────────────────────────────────────────

export function budgetSet(category, limit) {
  return `*Budget updated*\n${category} · monthly limit *${fmt(limit)}*`;
}

export function budgetStatusReport(statuses) {
  if (!statuses.length) {
    return (
      `No budgets yet.\n\n` +
      `Say e.g. "Set budget 3000 for Food" to add one.`
    );
  }

  const lines = [`*Budgets · this month*`, ``];

  for (const b of statuses) {
    lines.push(
      `*${b.category}*`,
      `${statusLabel(b.status)} · ${b.pct}% · ${fmt(b.spent)} / ${fmt(b.limit)}`,
      `Remaining: ${fmt(b.remaining)}`,
      ``
    );
  }

  return lines.join("\n").trimEnd();
}

export function budgetAlert(alerts) {
  if (!alerts.length) return null;

  const lines = [`*Budget notice*`, ``];
  for (const a of alerts) {
    const msg =
      a.status === "EXCEEDED"
        ? `${a.category}: over limit by ${fmt(a.spent - a.limit)}`
        : `${a.category}: ${a.pct}% used · ${fmt(a.limit - a.spent)} left`;
    lines.push(msg);
  }
  return lines.join("\n");
}

// ── Error / unknown ───────────────────────────────────────────────────────────

export const UNKNOWN_MSG =
  `I didn't understand that. For example, you can say:\n` +
  `• Spent 200 on lunch\n` +
  `• Received 5000 freelance (income)\n` +
  `• Lent 114 to Pranita\n` +
  `• How much did I spend this week?\n` +
  `• Who owes me money?`;

export const ERROR_MSG =
  `Something went wrong. Please try again in a moment.`;

/** Shown at most once: slow first NLP response (~3s+) or first failed attempt before retry. */
export const NLP_RETRY_NOTICE_MSG =
  `That's taking a moment — I'm still working on what you sent and I'll reply right here when it's ready. Please wait; no need to send it again.`;

export const SALARY_NUDGE_EXPENSE_MSG =
  `By the way — if you tell me your monthly salary, I can show you how much of it you've spent so far. Just say something like 'my salary is 85000 credited on the 5th' anytime.`;

export const SALARY_NUDGE_SUMMARY_MSG =
  `Add your salary to see your savings rate and how much is left for the month.`;

export const SALARY_NUDGE_MONTH_START_MSG =
  `New month! You haven't set up your salary yet — tell me your monthly income and I'll track your savings automatically.`;

function dayOrdinal(day) {
  const d = Number(day);
  if (d % 100 >= 11 && d % 100 <= 13) return `${d}th`;
  const last = d % 10;
  if (last === 1) return `${d}st`;
  if (last === 2) return `${d}nd`;
  if (last === 3) return `${d}rd`;
  return `${d}th`;
}

export function salarySetConfirmation(amount, creditDay) {
  return (
    `Got it. I'll add *${fmt(amount)}* to *income* on the *${dayOrdinal(
      creditDay
    )}* each month.\n` +
    `You can also log other income anytime, e.g. "received 3000 freelance".`
  );
}

export const SALARY_DAY_MISSING_MSG = `What date does it get credited?`;

/** Rejection when text exceeds the configured max length (no NLP call). */
export function messageTooLongRejection(maxChars) {
  return (
    `That message is too long (max ${maxChars} characters). ` +
    `Please shorten it and try again.`
  );
}
