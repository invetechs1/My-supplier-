-- AlterEnum: gateway intermediate states and bank-transfer proof awaiting confirmation
ALTER TYPE "PaymentRecordStatus" ADD VALUE 'AUTHORIZED';
ALTER TYPE "PaymentRecordStatus" ADD VALUE 'CAPTURED';
ALTER TYPE "PaymentRecordStatus" ADD VALUE 'SUBMITTED';

-- AlterTable: bank-transfer proof + who submitted / confirmed
ALTER TABLE "Payment" ADD COLUMN     "method" "PaymentMethod",
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "proofFile" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "submittedById" TEXT,
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_provider_status_idx" ON "Payment"("provider", "status");
