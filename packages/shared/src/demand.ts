// Demand intelligence: what buyers ask for (BOQ lines, RFQ items, zero-result searches) vs what we list.
export type DemandSource = "BOQ" | "RFQ" | "SEARCH";
export type DemandGapType = "UNLISTED" | "NO_OFFERS" | "THIN_COVERAGE" | "COVERED";
export type DemandStatus = "NEW" | "PLANNED" | "ADDED" | "IGNORED";

export interface DemandMaterialRef {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category?: { id: string; name: string } | null;
}

export interface DemandCluster {
  id: string;
  key: string;
  label: string;
  unit: string | null;
  materialId: string | null;
  material?: DemandMaterialRef | null;
  gapType: DemandGapType;
  status: DemandStatus;
  note: string | null;
  requests: number;
  buyers: number;
  totalQuantity: number;
  offerCount: number;
  notifiedLevel: number;
  topCities: { city: string; count: number }[];
  examples: string[];
  score: number;
  suggestion: string;
  firstRequestedAt: string;
  lastRequestedAt: string;
}

export interface DemandSignal {
  id: string;
  source: DemandSource;
  rawText: string;
  quantity: number | null;
  unit: string | null;
  city: string | null;
  materialId: string | null;
  confidence: number | null;
  offerCount: number | null;
  createdAt: string;
  buyer: { name: string; companyName: string | null } | null;
}

export interface DemandClusterDetail extends DemandCluster {
  signals: DemandSignal[];
}

export interface DemandOverview {
  days: number;
  signals: number;
  unmatchedSignals: number;
  unmatchedPct: number;
  bySource: Partial<Record<DemandSource, number>>;
  openGaps: number;
  byType: Partial<Record<DemandGapType, number>>;
  topCities: { city: string; count: number }[];
  topGaps: DemandCluster[];
}

export type LaunchStatus = "READY" | "NEEDS_SUPPLIERS" | "NO_OFFERS";

export interface LaunchListItem {
  id: string;
  sku: string;
  name: string;
  nameAr: string;
  unit: string;
  category: { id: string; name: string; slug: string };
  score: number;
  demandScore: number;
  requests: number;
  buyers: number;
  offers: number;
  freshOffers: number;
  suppliers: number;
  status: LaunchStatus;
  needed: number;
}

export interface LaunchList {
  city: string | null;
  size: number;
  freshDays: number;
  summary: { ready: number; needsSuppliers: number; noOffers: number; coveragePct: number; launchReady: boolean };
  items: LaunchListItem[];
}

export interface CreateMaterialFromDemandPayload {
  sku: string;
  name: string;
  nameAr: string;
  unit: string;
  categoryId: string;
  brand?: string | null;
  description?: string | null;
}
