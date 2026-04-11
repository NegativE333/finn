// src/utils/formatter.js
// User-facing message copy — clear structure, minimal decoration.

import { periodLabel, formatDate } from "./dateUtils.js";

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

export function expenseLogged(transaction, monthlyTotal) {
  const lines = [
    `*Expense recorded*`,
    `${fmt(transaction.amount)} · ${transaction.category}`,
  ];
  if (transaction.note) lines.push(`_${transaction.note}_`);
  lines.push(`Month to date: *${fmt(monthlyTotal)}*`);
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

// ── Monthly summary ───────────────────────────────────────────────────────────

export function monthlySummary(period, totalData, breakdown, lentDebts, borrowedDebts) {
  const label = periodLabel(period);
  const lines = [
    `*Summary · ${label}*`,
    ``,
    `Total spent: *${fmt(totalData.total)}*`,
  ];

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

// ── Proactive reminder ────────────────────────────────────────────────────────

export function debtReminder(lentDebts, borrowedDebts) {
  const lines = [`*Debt reminder*`, ``];

  if (lentDebts.length > 0) {
    lines.push(`*Outstanding receivables*`);
    lentDebts.forEach((d) => {
      lines.push(`  • ${d.personName}: ${fmt(d.amount)}`);
    });
  }

  if (borrowedDebts.length > 0) {
    if (lentDebts.length > 0) lines.push("");
    lines.push(`*Amounts you owe*`);
    borrowedDebts.forEach((d) => {
      lines.push(`  • ${d.personName}: ${fmt(Math.abs(d.amount))}`);
    });
  }

  lines.push(``, `When something is paid, reply e.g. "Rahul paid me back 500" or "Settle with Rahul".`);
  return lines.join("\n");
}

// ── Inline keyboards ──────────────────────────────────────────────────────────

/** Undo button for a just-logged transaction */
export function undoTransactionKeyboard(txnId) {
  return {
    inline_keyboard: [[{ text: "Undo", callback_data: `undo_txn:${txnId}` }]],
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
  `• Lent 500 to Priya\n` +
  `• How much did I spend this week?\n` +
  `• Who owes me money?`;

export const ERROR_MSG =
  `Something went wrong. Please try again in a moment.`;
