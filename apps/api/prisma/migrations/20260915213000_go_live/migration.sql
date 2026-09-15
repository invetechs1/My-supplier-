-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'BOOKED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CarrierCode" AS ENUM ('SUPPLIER', 'TRUKKER', 'TRELLA', 'SMSA', 'ARAMEX', 'SPL', 'OTHER');

-- CreateEnum
CREATE TYPE "ShippingZone" AS ENUM ('SAME_CITY', 'SAME_REGION', 'NATIONAL');

-- CreateEnum
CREATE TYPE "EInvoiceStatus" AS ENUM ('GENERATED', 'REPORTED', 'CLEARED', 'REJECTED', 'PENDING_CONFIG');

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "hazardous" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "volumeM3" DOUBLE PRECISION,
ADD COLUMN     "weightKg" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'LOGIN',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "carrier" "CarrierCode" NOT NULL DEFAULT 'SUPPLIER',
    "carrierName" TEXT NOT NULL,
    "service" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "cost" DECIMAL(14,2),
    "weightKg" DOUBLE PRECISION,
    "volumeM3" DOUBLE PRECISION,
    "pickupBranchId" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "vehicle" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingRate" (
    "id" TEXT NOT NULL,
    "carrier" "CarrierCode" NOT NULL,
    "zone" "ShippingZone" NOT NULL,
    "service" TEXT NOT NULL,
    "baseFee" DECIMAL(14,2) NOT NULL,
    "perKg" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "includedKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "perM3" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "minFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "maxWeightKg" DOUBLE PRECISION,
    "etaDays" INTEGER NOT NULL DEFAULT 2,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EInvoiceRecord" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "invoiceHash" TEXT NOT NULL,
    "previousInvoiceHash" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "xml" TEXT NOT NULL,
    "status" "EInvoiceStatus" NOT NULL DEFAULT 'GENERATED',
    "zatcaResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EInvoiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpCode_phone_createdAt_idx" ON "OtpCode"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "Shipment_orderId_idx" ON "Shipment"("orderId");

-- CreateIndex
CREATE INDEX "Shipment_trackingNumber_idx" ON "Shipment"("trackingNumber");

-- CreateIndex
CREATE INDEX "ShipmentEvent_shipmentId_idx" ON "ShipmentEvent"("shipmentId");

-- CreateIndex
CREATE INDEX "ShippingRate_carrier_zone_idx" ON "ShippingRate"("carrier", "zone");

-- CreateIndex
CREATE UNIQUE INDEX "EInvoiceRecord_orderId_key" ON "EInvoiceRecord"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "EInvoiceRecord_invoiceNumber_key" ON "EInvoiceRecord"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "EInvoiceRecord_uuid_key" ON "EInvoiceRecord"("uuid");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_pickupBranchId_fkey" FOREIGN KEY ("pickupBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EInvoiceRecord" ADD CONSTRAINT "EInvoiceRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

