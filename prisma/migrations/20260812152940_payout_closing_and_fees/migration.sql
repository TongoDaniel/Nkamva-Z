-- AlterTable
ALTER TABLE "payouts" ADD COLUMN     "feeFcfa" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isClosingPayout" BOOLEAN NOT NULL DEFAULT false;
