-- CreateEnum
CREATE TYPE "LegalDocument" AS ENUM ('TERMS', 'PRIVACY', 'SUPPLIER_AGREEMENT', 'RETURNS_POLICY');

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "imageAttribution" TEXT;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "labelUrl" TEXT;

-- CreateTable
CREATE TABLE "LegalAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "document" "LegalDocument" NOT NULL,
    "version" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "ip" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalAcceptance_userId_document_idx" ON "LegalAcceptance"("userId", "document");

-- CreateIndex
CREATE INDEX "LegalAcceptance_companyId_document_idx" ON "LegalAcceptance"("companyId", "document");

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
