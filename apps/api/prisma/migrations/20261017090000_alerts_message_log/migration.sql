-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED', 'DEV');

-- AlterEnum
ALTER TYPE "OutreachChannel" ADD VALUE 'SMS';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "alertSms" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "alertWhatsapp" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "companyId" TEXT,
    "channel" "MessageChannel" NOT NULL,
    "kind" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "providerId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageLog_userId_createdAt_idx" ON "MessageLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_createdAt_idx" ON "MessageLog"("createdAt");

