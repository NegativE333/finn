// src/services/scheduler.js
// Proactive daily reminders for outstanding debts

import cron from "node-cron";
import { getAllUsersWithPendingDebts } from "./debtService.js";
import { debtReminder } from "../utils/formatter.js";

/**
 * Starts the cron scheduler on the given Telegram bot instance.
 * @param {import('telegraf').Telegraf} bot
 */
export function startScheduler(bot) {
  // Runs every day at 9:00 AM IST (UTC+5:30 = 03:30 UTC)
  cron.schedule("30 3 * * *", async () => {
    console.log("[CRON] Running daily debt reminder...");

    try {
      const usersWithDebts = await getAllUsersWithPendingDebts();

      for (const { user, debts } of usersWithDebts) {
        const lentDebts = debts.filter((d) => d.amount > 0);
        const borrowedDebts = debts.filter((d) => d.amount < 0);

        if (lentDebts.length === 0 && borrowedDebts.length === 0) continue;

        try {
          await bot.telegram.sendMessage(
            user.telegramId.toString(),
            debtReminder(lentDebts, borrowedDebts),
            { parse_mode: "Markdown" }
          );
        } catch (sendErr) {
          // User may have blocked the bot — log and continue
          console.warn(`[CRON] Could not send to user ${user.telegramId}:`, sendErr.message);
        }
      }

      console.log(`[CRON] Reminders sent to ${usersWithDebts.length} user(s).`);
    } catch (err) {
      console.error("[CRON] Scheduler error:", err);
    }
  });

  console.log("[CRON] Daily debt reminder scheduled at 09:00 IST.");
}
