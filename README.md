# FinnGoBot

Telegram bot for logging expenses and debts in plain language, plus budgets, summaries, CSV export, and a daily morning recap of **yesterday’s spending**.

## Setup

```bash
git clone <repo-url>
cd finngobot
npm install
cp .env.example .env
```

Fill `.env` (see `.env.example` for placeholders): Telegram bot token, Groq API key, PostgreSQL `DATABASE_URL` and `DIRECT_URL` (e.g. Supabase pooled + direct for Prisma).

```bash
npm run db:migrate   # or: npm run db:push (dev)
npm run dev          # local: long polling
```

Production: set `NODE_ENV=production` and `WEBHOOK_DOMAIN` to your public URL; start with `npm start`.

## Deploy (e.g. Render)

- **Start command:** `npx prisma migrate deploy && npm start` (or `npm run db:migrate && npm start`)
- Add the same variables as in `.env.example`.

## Usage

Talk naturally (e.g. “Spent 500 on petrol”, “Who owes me money?”) or use `/help` for commands like `/summary`, `/week`, `/debts`, `/budget`, `/export`.
