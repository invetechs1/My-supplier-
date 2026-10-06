-- CreateEnum
CREATE TYPE "DemandSource" AS ENUM ('BOQ', 'RFQ', 'SEARCH');

-- CreateEnum
CREATE TYPE "DemandGapType" AS ENUM ('UNLISTED', 'NO_OFFERS', 'THIN_COVERAGE', 'COVERED');

-- CreateEnum
CREATE TYPE "DemandStatus" AS ENUM ('NEW', 'PLANNED', 'ADDED', 'IGNORED');

-- CreateTable
CREATE TABLE "DemandSignal" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "source" "DemandSource" NOT NULL,
    "rawText" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "city" TEXT,
    "materialId" TEXT,
    "confidence" DOUBLE PRECISION,
    "offerCount" INTEGER,
    "userId" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandCluster" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT,
    "materialId" TEXT,
    "gapType" "DemandGapType" NOT NULL DEFAULT 'UNLISTED',
    "status" "DemandStatus" NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "totalQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "buyerKeys" JSONB NOT NULL DEFAULT '[]',
    "cities" JSONB NOT NULL DEFAULT '{}',
    "examples" JSONB NOT NULL DEFAULT '[]',
    "offerCount" INTEGER NOT NULL DEFAULT 0,
    "notifiedLevel" INTEGER NOT NULL DEFAULT 0,
    "firstRequestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRequestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandCluster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemandSignal_clusterId_createdAt_idx" ON "DemandSignal"("clusterId", "createdAt");

-- CreateIndex
CREATE INDEX "DemandSignal_createdAt_idx" ON "DemandSignal"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DemandCluster_key_key" ON "DemandCluster"("key");

-- CreateIndex
CREATE INDEX "DemandCluster_gapType_status_requests_idx" ON "DemandCluster"("gapType", "status", "requests");

-- CreateIndex
CREATE INDEX "DemandCluster_lastRequestedAt_idx" ON "DemandCluster"("lastRequestedAt");

-- AddForeignKey
ALTER TABLE "DemandSignal" ADD CONSTRAINT "DemandSignal_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "DemandCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandCluster" ADD CONSTRAINT "DemandCluster_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

