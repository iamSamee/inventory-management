-- AlterTable
ALTER TABLE "items" DROP COLUMN "threshold";

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

