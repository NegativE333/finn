// src/handlers/callbackHandler.js
// Handles inline keyboard button presses from Telegraf's `bot.action()`

import prisma from "../services/prisma.js";
import { deleteBudget } from "../services/budgetService.js";
import { upsertUser } from "../services/userService.js";
import { fmt } from "../utils/formatter.js";

/**
 * Register all callback query handlers on the bot.
 * Call this once during bot setup in index.js.
 * @param {import('telegraf').Telegraf} bot
 */
export function registerCallbacks(bot) {
  // ── Undo last transaction ─────────────────────────────────────────────────
  bot.action(/^undo_txn:(\d+)$/, async (ctx) => {
    const txnId = parseInt(ctx.match[1], 10);
    const user = await upsertUser(ctx);

    try {
      const txn = await prisma.transaction.findUnique({ where: { id: txnId } });

      if (!txn || txn.userId !== user.id) {
        await ctx.answerCbQuery("❌ Transaction not found or already deleted.");
        return ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      }

      await prisma.transaction.delete({ where: { id: txnId } });

      await ctx.answerCbQuery("✅ Transaction deleted.");
      await ctx.editMessageText(
        `🗑 Deleted: *${fmt(txn.amount)}* for ${txn.category}${txn.note ? ` (${txn.note})` : ""}`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      console.error("[CB] undo_txn error:", err);
      await ctx.answerCbQuery("⚠️ Could not delete. Try again.");
    }
  });

  // ── Undo last debt ────────────────────────────────────────────────────────
  bot.action(/^undo_debt:(\d+)$/, async (ctx) => {
    const debtId = parseInt(ctx.match[1], 10);
    const user = await upsertUser(ctx);

    try {
      const debt = await prisma.debt.findUnique({ where: { id: debtId } });

      if (!debt || debt.userId !== user.id) {
        await ctx.answerCbQuery("❌ Debt record not found or already deleted.");
        return ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      }

      await prisma.debt.delete({ where: { id: debtId } });

      const type = Number(debt.amount) > 0 ? "Lent" : "Borrowed";
      await ctx.answerCbQuery("✅ Debt record deleted.");
      await ctx.editMessageText(
        `🗑 Removed: *${type} ${fmt(Math.abs(Number(debt.amount)))}* with ${debt.personName}`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      console.error("[CB] undo_debt error:", err);
      await ctx.answerCbQuery("⚠️ Could not delete. Try again.");
    }
  });

  // ── Delete a budget ───────────────────────────────────────────────────────
  bot.action(/^del_budget:(.+)$/, async (ctx) => {
    const category = ctx.match[1];
    const user = await upsertUser(ctx);

    try {
      await deleteBudget(user.id, category);
      await ctx.answerCbQuery(`✅ Budget for ${category} removed.`);
      await ctx.editMessageText(`🗑 Removed budget for *${category}*.`, {
        parse_mode: "Markdown",
      });
    } catch (err) {
      console.error("[CB] del_budget error:", err);
      await ctx.answerCbQuery("⚠️ Could not remove budget.");
    }
  });

  // ── Dismiss / cancel (generic) ────────────────────────────────────────────
  bot.action("dismiss", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {}); // Ignore if already gone
  });
}
