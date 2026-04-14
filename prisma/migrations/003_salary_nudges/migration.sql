-- Add salary config and salary nudge tracking to users
ALTER TABLE "users"
  ADD COLUMN "monthly_salary" NUMERIC(12, 2),
  ADD COLUMN "salary_credit_day" INTEGER,
  ADD COLUMN "nudges_shown" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "last_nudge_at" TIMESTAMPTZ;
