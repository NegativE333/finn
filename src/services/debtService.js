// src/services/debtService.js
// Debt tracking: lent (positive), borrowed (negative), and settlement

import prisma from "./prisma.js";

/**
 * Record a new debt entry.
 * @param {number} userId
 * @param {object} intent  - Parsed NLP intent
 * @param {"LENT"|"BORROWED"} direction
 */
export async function recordDebt(userId, intent, direction) {
  const signedAmount =
    direction === "LENT"
      ? Math.abs(intent.amount)
      : -Math.abs(intent.amount);

  return prisma.debt.create({
    data: {
      userId,
      personName: intent.person,
      amount: signedAmount,
      note: intent.note ?? null,
      dueDate: intent.due_date ? new Date(intent.due_date) : null,
    },
  });
}

/**
 * Settle a debt partially or fully.
 * When a person pays back, we reduce the outstanding lent amount.
 * @param {number} userId
 * @param {string} personName
 * @param {number} amount  - Amount being settled
 */
export async function settleDebt(userId, personName, amount) {
  // Find active (unsettled) debts with this person
  const debts = await prisma.debt.findMany({
    where: {
      userId,
      personName: { equals: personName, mode: "insensitive" },
      isSettled: false,
    },
    orderBy: { createdAt: "asc" },
  });

  if (!debts.length) return { settled: false, message: "No active debt found." };

  let remaining = amount;
  const updates = [];

  for (const debt of debts) {
    if (remaining <= 0) break;
    const debtAbs = Math.abs(Number(debt.amount));

    if (remaining >= debtAbs) {
      updates.push(
        prisma.debt.update({
          where: { id: debt.id },
          data: { isSettled: true },
        })
      );
      remaining -= debtAbs;
    } else {
      // Partial settlement: reduce the amount
      const newAmount = debt.amount > 0
        ? Number(debt.amount) - remaining
        : Number(debt.amount) + remaining;
      updates.push(
        prisma.debt.update({
          where: { id: debt.id },
          data: { amount: newAmount },
        })
      );
      remaining = 0;
    }
  }

  await prisma.$transaction(updates);
  return { settled: true, amountSettled: amount };
}

/**
 * Get all outstanding debts (what others owe the user — lent, positive amounts).
 * @param {number} userId
 */
export async function getLentDebts(userId) {
  const debts = await prisma.debt.findMany({
    where: { userId, isSettled: false, amount: { gt: 0 } },
    orderBy: { createdAt: "desc" },
  });
  return debts.map((d) => ({ ...d, amount: Number(d.amount) }));
}

/**
 * Get all outstanding debts (what the user owes others — borrowed, negative amounts).
 * @param {number} userId
 */
export async function getBorrowedDebts(userId) {
  const debts = await prisma.debt.findMany({
    where: { userId, isSettled: false, amount: { lt: 0 } },
    orderBy: { createdAt: "desc" },
  });
  return debts.map((d) => ({ ...d, amount: Number(d.amount) }));
}

/**
 * Get all outstanding debts for a specific person.
 * @param {number} userId
 * @param {string} personName
 */
export async function getDebtsByPerson(userId, personName) {
  const debts = await prisma.debt.findMany({
    where: {
      userId,
      personName: { equals: personName, mode: "insensitive" },
      isSettled: false,
    },
  });
  return debts.map((d) => ({ ...d, amount: Number(d.amount) }));
}

/**
 * Get all users with pending debts (for reminder cron job).
 */
export async function getAllUsersWithPendingDebts() {
  const debts = await prisma.debt.findMany({
    where: { isSettled: false },
    include: { user: true },
    distinct: ["userId"],
  });

  // Group by userId
  const userMap = new Map();
  for (const debt of debts) {
    if (!userMap.has(debt.userId)) {
      userMap.set(debt.userId, { user: debt.user, debts: [] });
    }
    userMap.get(debt.userId).debts.push({ ...debt, amount: Number(debt.amount) });
  }

  return Array.from(userMap.values());
}
