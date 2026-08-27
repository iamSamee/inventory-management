-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('in', 'out');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "threshold" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "qty_changed" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "items_barcode_key" ON "items"("barcode");

-- CreateIndex
CREATE INDEX "transactions_item_id_idx" ON "transactions"("item_id");

-- CreateIndex
CREATE INDEX "transactions_timestamp_idx" ON "transactions"("timestamp");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

