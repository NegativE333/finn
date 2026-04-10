// src/services/userService.js
// Handles user creation / retrieval keyed on Telegram ID

import prisma from "./prisma.js";

/**
 * Upsert a user record from a Telegraf context object.
 * @param {import('telegraf').Context} ctx
 * @returns {Promise<import('@prisma/client').User>}
 */
export async function upsertUser(ctx) {
  const { id, username, first_name } = ctx.from;

  return prisma.user.upsert({
    where: { telegramId: BigInt(id) },
    update: { username: username ?? null, firstName: first_name ?? null },
    create: {
      telegramId: BigInt(id),
      username: username ?? null,
      firstName: first_name ?? null,
    },
  });
}

/**
 * Fetch a user by their Telegram ID.
 * @param {number|bigint} telegramId
 */
export async function getUserByTelegramId(telegramId) {
  return prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
}
