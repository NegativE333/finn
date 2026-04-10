# FinnGoBot 🤖

A "headless" personal finance assistant for Telegram. Track expenses and debts via natural language — no UI needed.

---

## Features

- **Expense Logging** — "Spent 500 on petrol" → auto-categorized and stored
- **Debt Tracking** — "Lent 1000 to Rahul" / "Borrowed 500 from Amit"
- **Smart Queries** — "How much did I spend this week?" / "Who owes me money?"
- **Daily Reminders** — Proactive 9 AM nudge for pending debts
- **Summaries** — Weekly/monthly breakdowns by category
- **Multi-user** — Each user identified by their Telegram ID

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ (ESM) |
| Bot Framework | Telegraf v4 |
| NLP | Gemini 1.5 Flash |
| Database | PostgreSQL (Supabase / Neon) |
| ORM | Prisma |
| Scheduler | node-cron |
| Hosting | Render |

---

## Project Structure

```
finngobot/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── index.js               # Entry point — bot setup & launch
│   ├── handlers/
│   │   ├── messageHandler.js  # NLP intent router
│   │   └── commandHandlers.js # /start, /help, /summary, etc.
│   ├── services/
│   │   ├── prisma.js          # Prisma client singleton
│   │   ├── nlp.js             # Gemini intent parsing
│   │   ├── userService.js     # User upsert / lookup
│   │   ├── transactionService.js  # Expense CRUD
│   │   ├── debtService.js     # Debt CRUD & settlement
│   │   └── scheduler.js       # Daily reminder cron
│   └── utils/
│       ├── dateUtils.js       # Period → date range helpers
│       └── formatter.js       # All message formatting
├── .env.example
└── package.json
```

---

## Setup

### 1. Clone & Install

```bash
git clone <repo>
cd finngobot
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Fill in your `.env`:

```env
TELEGRAM_BOT_TOKEN=   # From @BotFather
GEMINI_API_KEY=       # From Google AI Studio
DATABASE_URL=         # PostgreSQL connection string (Supabase/Neon)
WEBHOOK_DOMAIN=       # Your Render URL (production only)
```

### 3. Set Up the Database

```bash
# Push schema to database (development)
npm run db:push

# Or run migrations (production)
npm run db:migrate
```

### 4. Run

```bash
# Development (long-polling)
npm run dev

# Production
NODE_ENV=production npm start
```

---

## Deploy to Render

1. Push code to GitHub
2. Create a new **Web Service** on Render pointing to your repo
3. Set **Start Command**: `npm run db:migrate && npm start`
4. Add all environment variables from `.env.example`
5. Set `NODE_ENV=production` and `WEBHOOK_DOMAIN=https://your-app.onrender.com`

Render will automatically run as a persistent service. The bot uses webhooks in production for efficiency.

---

## Usage Examples

| You say | Finn does |
|---------|-----------|
| `Spent 500 on petrol` | Logs ₹500 under Transport |
| `40 for chai` | Logs ₹40 under Food & Dining |
| `Lent 1000 to Rahul for dinner` | Creates a lent debt record |
| `Borrowed 500 from Amit` | Creates a borrowed debt record |
| `Rahul paid me back 500` | Settles ₹500 from Rahul's debt |
| `How much did I spend yesterday?` | Shows yesterday's total + breakdown |
| `Who owes me money?` | Lists all lent debts |
| `Monthly summary` | Full this-month report |

### Commands

| Command | Description |
|---------|-------------|
| `/start` | Introduction & onboarding |
| `/help` | Quick reference guide |
| `/summary` | This month's full summary |
| `/week` | This week's spending breakdown |
| `/debts` | All outstanding debts |

---

## Database Schema

```
users          → telegram_id (PK), username, first_name, created_at
transactions   → id, user_id, amount, category, note, timestamp
debts          → id, user_id, person_name, amount*, note, due_date, is_settled

* Positive amount = lent (they owe you)
* Negative amount = borrowed (you owe them)
```

---

## Extending Finn

- **Voice messages**: Add a handler for `message("voice")` and use Gemini's audio input
- **Budget alerts**: Add a `budget` table and check limits in `handleExpense`
- **Recurring expenses**: Add a `is_recurring` flag and monthly auto-log cron
- **Export**: Add a `/export` command that generates a CSV via `csv-stringify`
