// prisma/seed.js
// Seeds the database with sample data for local development.
// Run with: npx prisma db seed

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const SEED_TELEGRAM_ID = 999000001n; // Fake Telegram ID for dev

async function main() {
  console.log("🌱 Seeding database...");

  // ── Upsert dev user ───────────────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { telegramId: SEED_TELEGRAM_ID },
    update: {},
    create: {
      telegramId: SEED_TELEGRAM_ID,
      username: "devuser",
      firstName: "Dev",
    },
  });
  console.log(`   User: ${user.firstName} (id=${user.id})`);

  // ── Transactions ──────────────────────────────────────────────────────────
  const now = new Date();
  const daysAgo = (n) => new Date(now - n * 86_400_000);

  const transactions = [
    { amount: 500,  category: "Transport",     note: "petrol",          timestamp: daysAgo(0) },
    { amount: 40,   category: "Food & Dining", note: "chai",            timestamp: daysAgo(0) },
    { amount: 850,  category: "Food & Dining", note: "dinner with team",timestamp: daysAgo(1) },
    { amount: 1200, category: "Shopping",      note: "new headphones",  timestamp: daysAgo(2) },
    { amount: 300,  category: "Utilities",     note: "phone recharge",  timestamp: daysAgo(3) },
    { amount: 200,  category: "Health",        note: "medicine",        timestamp: daysAgo(4) },
    { amount: 650,  category: "Food & Dining", note: "groceries",       timestamp: daysAgo(5) },
    { amount: 350,  category: "Entertainment", note: "movie tickets",   timestamp: daysAgo(6) },
    { amount: 90,   category: "Food & Dining", note: "lunch",           timestamp: daysAgo(7) },
    { amount: 1800, category: "Transport",     note: "cab to airport",  timestamp: daysAgo(8) },
  ];

  for (const t of transactions) {
    await prisma.transaction.create({ data: { userId: user.id, ...t } });
  }
  console.log(`   Transactions: ${transactions.length} created`);

  // ── Debts ─────────────────────────────────────────────────────────────────
  const debts = [
    { personName: "Rahul", amount:  1000, note: "dinner last week",   isSettled: false },
    { personName: "Priya", amount:  500,  note: "movie tickets",      isSettled: false },
    { personName: "Amit",  amount: -800,  note: "borrowed for travel",isSettled: false },
    { personName: "Sara",  amount:  2000, note: "concert tickets",    isSettled: false,
      dueDate: new Date(now.getFullYear(), now.getMonth() + 1, 15) },
  ];

  for (const d of debts) {
    await prisma.debt.create({ data: { userId: user.id, ...d } });
  }
  console.log(`   Debts: ${debts.length} created`);

  // ── Budgets ───────────────────────────────────────────────────────────────
  const budgets = [
    { category: "Food & Dining", limitAmount: 4000 },
    { category: "Transport",     limitAmount: 3000 },
    { category: "Shopping",      limitAmount: 2000 },
    { category: "Entertainment", limitAmount: 1000 },
  ];

  for (const b of budgets) {
    await prisma.budget.upsert({
      where: { userId_category: { userId: user.id, category: b.category } },
      update: { limitAmount: b.limitAmount },
      create: { userId: user.id, ...b },
    });
  }
  console.log(`   Budgets: ${budgets.length} created`);

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
