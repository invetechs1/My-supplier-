-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('SUPPLIER_PRICE_LIST', 'BUYER_QUOTATION', 'WEB_PAGE', 'TEXT');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PROCESSING', 'REVIEW', 'PUBLISHED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('SUGGESTED', 'APPROVED', 'REJECTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "OutreachChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'LINK');

-- AlterEnum
ALTER TYPE "PriceSource" ADD VALUE 'QUOTATION';

-- AlterTable
ALTER TABLE "Feed" ADD COLUMN     "autoPublish" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "companyId" TEXT;

-- CreateTable
CREATE TABLE "PriceImport" (
    "id" TEXT NOT NULL,
    "kind" "ImportKind" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "sourceName" TEXT NOT NULL,
    "supplierName" TEXT,
    "companyId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "city" TEXT,
    "quotationDate" TIMESTAMP(3),
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT,
    "extractedCount" INTEGER NOT NULL DEFAULT 0,
    "publishedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "rawText" TEXT,
    "feedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceImportRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "rawUnit" TEXT,
    "rawPrice" TEXT,
    "rawCity" TEXT,
    "brand" TEXT,
    "notes" TEXT,
    "price" DECIMAL(14,2),
    "unit" TEXT NOT NULL,
    "city" TEXT,
    "materialId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alternatives" JSONB,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'SUGGESTED',
    "createMaterial" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PriceImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceUpdateRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "channel" "OutreachChannel" NOT NULL DEFAULT 'LINK',
    "createdById" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "updatedRows" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PriceUpdateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceImport_uploadedById_idx" ON "PriceImport"("uploadedById");

-- CreateIndex
CREATE INDEX "PriceImport_status_kind_idx" ON "PriceImport"("status", "kind");

-- CreateIndex
CREATE INDEX "PriceImportRow_importId_idx" ON "PriceImportRow"("importId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceUpdateRequest_tokenHash_key" ON "PriceUpdateRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "PriceUpdateRequest_companyId_idx" ON "PriceUpdateRequest"("companyId");

-- AddForeignKey
ALTER TABLE "PriceImport" ADD CONSTRAINT "PriceImport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceImport" ADD CONSTRAINT "PriceImport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceImportRow" ADD CONSTRAINT "PriceImportRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "PriceImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceImportRow" ADD CONSTRAINT "PriceImportRow_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceUpdateRequest" ADD CONSTRAINT "PriceUpdateRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
