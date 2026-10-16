-- AlterTable
ALTER TABLE "PriceUpdateRequest" ADD COLUMN     "note" TEXT,
ADD COLUMN     "requestedCity" TEXT,
ADD COLUMN     "requestedMaterialIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

