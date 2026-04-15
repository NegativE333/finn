-- Income ledger: manual entries + automatic monthly salary credits
CREATE TYPE "IncomeSource" AS ENUM ('salary', 'other');

CREATE TABLE "incomes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amount" NUMERIC(12, 2) NOT NULL,
    "source" "IncomeSource" NOT NULL,
    "note" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incomes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "incomes_user_id_timestamp_idx" ON "incomes"("user_id", "timestamp");

ALTER TABLE "incomes" ADD CONSTRAINT "incomes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
