// src/utils/formatter.js
// All message formatting lives here. Finn speaks clearly and minimally.

import { periodLabel, formatDate } from "./dateUtils.js";

const RUPEE = "₹";

export function fmt(amount) {
  return `${RUPEE}${Number(amount).toLocaleString("en-IN")}`;
}

// ── Expense confirmations ─────────────────────────────────────────────────────

export function expenseLogged(transaction, monthlyTotal) {
  const lines = [
    `✅ *Logged ${fmt(transaction.amount)}* for ${transaction.category}`,
  ];
  if (transaction.note) lines.push(`📝 _${transaction.note}_`);
  lines.push(`📊 Your total this month: *${fmt(monthlyTotal)}*`);
  return lines.join("\n");
}

// ── Debt confirmations ────────────────────────────────────────────────────────

export function debtLogged(debt) {
  const isLent = Number(debt.amount) > 0;
  const absAmt = Math.abs(Number(debt.amount));
  const emoji = isLent ? "🤝" : "💸";
  const verb = isLent ? `You lent` : `You borrowed`;
  const prep = isLent ? `to` : `from`;

  const lines = [
    `${emoji} *${verb} ${fmt(absAmt)} ${prep} ${debt.personName}*`,
  ];
  if (debt.note) lines.push(`📝 _${debt.note}_`);
  if (debt.dueDate) lines.push(`📅 Due: ${formatDate(debt.dueDate)}`);
  return lines.join("\n");
}

export function debtSettled(personName, amount) {
  return `✅ *Settled ${fmt(amount)} with ${personName}*. Marked as paid.`;
}

// ── Query responses ───────────────────────────────────────────────────────────

export function expenseSummary(data, breakdown) {
  const label = periodLabel(data.period);
  if (data.total === 0) {
    return `📭 No expenses recorded for *${label}*.`;
  }

  const lines = [
    `📊 *${label}'s Spending — ${fmt(data.total)}*`,
    ``,
    ...breakdown.map(
      (b) => `• ${b.category}: *${fmt(b.total)}* (${b.count} txn)`
    ),
  ];
  return lines.join("\n");
}

export function debtList(lentDebts, borrowedDebts) {
  const lines = [];

  if (lentDebts.length === 0 && borrowedDebts.length === 0) {
    return "🎉 All clear! No pending debts.";
  }

  if (lentDebts.length > 0) {
    const totalLent = lentDebts.reduce((s, d) => s + d.amount, 0);
    lines.push(`💰 *People who owe you — ${fmt(totalLent)} total:*`);
    lentDebts.forEach((d) => {
      const due = d.dueDate ? ` (due ${formatDate(d.dueDate)})` : "";
      lines.push(`  • ${d.personName}: *${fmt(d.amount)}*${due}`);
    });
    lines.push("");
  }

  if (borrowedDebts.length > 0) {
    const totalBorrowed = borrowedDebts.reduce((s, d) => s + Math.abs(d.amount), 0);
    lines.push(`🔴 *You owe — ${fmt(totalBorrowed)} total:*`);
    borrowedDebts.forEach((d) => {
      const due = d.dueDate ? ` (due ${formatDate(d.dueDate)})` : "";
      lines.push(`  • ${d.personName}: *${fmt(Math.abs(d.amount))}*${due}`);
    });
  }

  return lines.join("\n");
}

// ── Monthly summary ───────────────────────────────────────────────────────────

export function monthlySummary(period, totalData, breakdown, lentDebts, borrowedDebts) {
  const label = periodLabel(period);
  const lines = [
    `📋 *${label} Summary*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `💸 *Total Spent: ${fmt(totalData.total)}*`,
  ];

  if (breakdown.length > 0) {
    lines.push(`\n🗂 *By Category:*`);
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
    lines.push(`\n💼 *Outstanding Debts:*`);
    if (totalLent > 0) lines.push(`  Others owe you: ${fmt(totalLent)}`);
    if (totalBorrowed > 0) lines.push(`  You owe others: ${fmt(totalBorrowed)}`);
  }

  lines.push(`\n_Powered by Finn 🤖_`);
  return lines.join("\n");
}

// ── Proactive reminder ────────────────────────────────────────────────────────

export function debtReminder(lentDebts, borrowedDebts) {
  const lines = [`⏰ *Daily Debt Check-In*\n`];

  if (lentDebts.length > 0) {
    lines.push(`💰 *Outstanding — people owe you:*`);
    lentDebts.forEach((d) => {
      lines.push(`  • ${d.personName}: ${fmt(d.amount)}`);
    });
  }

  if (borrowedDebts.length > 0) {
    if (lentDebts.length > 0) lines.push("");
    lines.push(`🔴 *You still owe:*`);
    borrowedDebts.forEach((d) => {
      lines.push(`  • ${d.personName}: ${fmt(Math.abs(d.amount))}`);
    });
  }

  lines.push(`\nReply "settled [name] [amount]" when done.`);
  return lines.join("\n");
}

// ── Inline keyboards ──────────────────────────────────────────────────────────

/** Undo button for a just-logged transaction */
export function undoTransactionKeyboard(txnId) {
  return {
    inline_keyboard: [[{ text: "↩️ Undo", callback_data: `undo_txn:${txnId}` }]],
  };
}

/** Undo button for a just-logged debt */
export function undoDebtKeyboard(debtId) {
  return {
    inline_keyboard: [[{ text: "↩️ Undo", callback_data: `undo_debt:${debtId}` }]],
  };
}

/** Delete budget button */
export function deleteBudgetKeyboard(category) {
  return {
    inline_keyboard: [
      [{ text: "🗑 Remove this budget", callback_data: `del_budget:${category}` }],
      [{ text: "✖ Dismiss", callback_data: "dismiss" }],
    ],
  };
}

// ── Budget formatting ─────────────────────────────────────────────────────────

export function budgetSet(category, limit) {
  return `✅ *Budget set for ${category}*\nMonthly limit: *${fmt(limit)}*`;
}

export function budgetStatusReport(statuses) {
  if (!statuses.length) {
    return (
      `📭 No budgets set yet.\n\n` +
      `Use: "Set budget 3000 for food" to create one.`
    );
  }

  const statusIcon = (s) => (s === "EXCEEDED" ? "🔴" : s === "WARNING" ? "🟡" : "🟢");
  const bar = (pct) => {
    const filled = Math.round(Math.min(pct, 100) / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
  };

  const lines = [`📊 *Budget Status — This Month*\n`];

  for (const b of statuses) {
    lines.push(
      `${statusIcon(b.status)} *${b.category}*`,
      `  ${bar(b.pct)} ${b.pct}%`,
      `  Spent: ${fmt(b.spent)} / ${fmt(b.limit)}`,
      `  Remaining: ${fmt(b.remaining)}`,
      ``
    );
  }

  return lines.join("\n").trimEnd();
}

export function budgetAlert(alerts) {
  if (!alerts.length) return null;

  const lines = [`⚠️ *Budget Alert*\n`];
  for (const a of alerts) {
    const icon = a.status === "EXCEEDED" ? "🔴" : "🟡";
    const msg =
      a.status === "EXCEEDED"
        ? `Exceeded by ${fmt(a.spent - a.limit)}`
        : `${a.pct}% used — ${fmt(a.limit - a.spent)} left`;
    lines.push(`${icon} *${a.category}*: ${msg}`);
  }
  return lines.join("\n");
}

// ── Error / unknown ───────────────────────────────────────────────────────────

export const UNKNOWN_MSG =
  `🤔 I didn't quite catch that. Try something like:\n` +
  `• "Spent 200 on lunch"\n` +
  `• "Lent 500 to Priya"\n` +
  `• "How much did I spend this week?"\n` +
  `• "Who owes me money?"`;

export const ERROR_MSG =
  `⚠️ Something went wrong on my end. Please try again in a moment.`;
