-- Migration: 001_init
-- Creates all tables for FinnGoBot

CREATE TABLE "users" (
  "id"         SERIAL PRIMARY KEY,
  "telegram_id" BIGINT NOT NULL UNIQUE,
  "username"   TEXT,
  "first_name" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "transactions" (
  "id"        SERIAL PRIMARY KEY,
  "user_id"   INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "amount"    NUMERIC(12, 2) NOT NULL,
  "category"  TEXT NOT NULL,
  "note"      TEXT,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "debts" (
  "id"          SERIAL PRIMARY KEY,
  "user_id"     INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "person_name" TEXT NOT NULL,
  "amount"      NUMERIC(12, 2) NOT NULL,
  "note"        TEXT,
  "due_date"    TIMESTAMPTZ,
  "is_settled"  BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "budgets" (
  "id"           SERIAL PRIMARY KEY,
  "user_id"      INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "category"     TEXT NOT NULL,
  "limit_amount" NUMERIC(12, 2) NOT NULL,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("user_id", "category")
);

-- Indexes for common query patterns
CREATE INDEX "transactions_user_timestamp_idx" ON "transactions"("user_id", "timestamp" DESC);
CREATE INDEX "transactions_user_category_idx"  ON "transactions"("user_id", "category");
CREATE INDEX "debts_user_settled_idx"          ON "debts"("user_id", "is_settled");
CREATE INDEX "debts_user_person_idx"           ON "debts"("user_id", "person_name");
CREATE INDEX "budgets_user_idx"                ON "budgets"("user_id");
