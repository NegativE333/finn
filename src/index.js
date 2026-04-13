// src/index.js
// FinnGoBot — Entry point
// Supports webhook mode (production/Render) and long-polling (local dev)

import "dotenv/config";
import "node:process";
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";

import prisma from "./services/prisma.js";
import { startScheduler } from "./services/scheduler.js";
import { rateLimiter } from "./middleware/rateLimiter.js";
import { sessionMiddleware } from "./middleware/session.js";
import { handleMessage } from "./handlers/messageHandler.js";
import { registerCallbacks } from "./handlers/callbackHandler.js";
import {
  handleStart,
  handleHelp,
  handleSummaryCommand,
  handleWeekCommand,
  handleDebtsCommand,
  handleBudgetCommand,
  handleExportCommand,
  handleExportDebtsCommand,
} from "./handlers/commandHandlers.js";

// ── Validate environment ──────────────────────────────────────────────────────
const REQUIRED_ENV = ["TELEGRAM_BOT_TOKEN", "GROQ_API_KEY", "DATABASE_URL"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// ── Bot setup ─────────────────────────────────────────────────────────────────
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ── Global middleware (order matters) ─────────────────────────────────────────

// 1. Logger
bot.use(async (ctx, next) => {
  const user = ctx.from;
  const text = ctx.message?.text ?? ctx.callbackQuery?.data ?? "[non-text]";
  console.log(`[IN] @${user?.username ?? user?.id}: ${text}`);
  return next();
});

// 2. Rate limiter — drop spam before it hits the DB or Groq
bot.use(rateLimiter);

// 3. Session — attaches ctx.session for multi-step flows
bot.use(sessionMiddleware);

// ── Command handlers ──────────────────────────────────────────────────────────
bot.start(handleStart);
bot.help(handleHelp);
bot.command("summary", handleSummaryCommand);
bot.command("week", handleWeekCommand);
bot.command("debts", handleDebtsCommand);
bot.command("budget", handleBudgetCommand);
bot.command("export", handleExportCommand);
bot.command("exportdebts", handleExportDebtsCommand);

// ── Inline keyboard callback handlers ────────────────────────────────────────
registerCallbacks(bot);

// ── Natural language message handler ─────────────────────────────────────────
bot.on(message("text"), handleMessage);

// ── Global error boundary ─────────────────────────────────────────────────────
bot.catch((err, ctx) => {
  console.error(`[BOT] Unhandled error for ${ctx.updateType}:`, err);
  ctx.reply("Something went wrong. Please try again.").catch(() => {});
});

// ── Launch ────────────────────────────────────────────────────────────────────
async function launch() {
  try {
    await prisma.$connect();
    console.log("Database connected.");
  } catch (err) {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  }

  const isProduction = process.env.NODE_ENV === "production";
  const webhookDomain = process.env.WEBHOOK_DOMAIN;
  const useWebhook = isProduction && Boolean(webhookDomain);
  console.log(
    `[BOOT] Telegram: ${useWebhook ? "webhook" : "long-polling"} | NODE_ENV=${process.env.NODE_ENV ?? "(unset)"}`
  );

  if (useWebhook) {

    const port = parseInt(
      process.env.PORT ?? process.env.WEBHOOK_PORT ?? "3000",
      10
    );

    await bot.launch({
      webhook: {
        domain: webhookDomain,
        host: "0.0.0.0",
        port,
      },
    });

    console.log(`Finn webhook listening on 0.0.0.0:${port}`);
    try {
      const wh = await bot.telegram.getWebhookInfo();
      if (wh.url) console.log(`Webhook (from Telegram): ${wh.url}`);
    } catch (e) {
      console.warn("Could not fetch webhook info:", e.message);
    }
    startScheduler(bot);
    console.log("Finn is online.\n");
  } else {
    // Long-polling: Telegraf awaits an infinite getUpdates loop, so code after
    // bot.launch() would never run. Scheduler + logs must come first.
    if (isProduction && !webhookDomain) {
      console.warn(
        "Finn long-polling — WEBHOOK_DOMAIN is not set; Telegram webhooks are disabled."
      );
    } else {
      console.log("Finn long-polling (local dev)");
    }
    startScheduler(bot);
    console.log("Finn is online.\n");
    await bot.launch();
  }
}

launch();

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.once("SIGINT", async () => {
  console.log("\n[SHUTDOWN] SIGINT — stopping...");
  bot.stop("SIGINT");
  await prisma.$disconnect();
  process.exit(0);
});

process.once("SIGTERM", async () => {
  console.log("\n[SHUTDOWN] SIGTERM — stopping...");
  bot.stop("SIGTERM");
  await prisma.$disconnect();
  process.exit(0);
});
