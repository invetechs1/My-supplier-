import type { CreateMaterialFromDemandPayload, DemandCluster, DemandClusterDetail, DemandGapType, DemandOverview, DemandSource, DemandStatus, LaunchList, LaunchStatus, Material, Paginated } from "@mysupplier/shared";
import { request } from "../api";

const enc = encodeURIComponent;

export interface GapQuery {
  gapType?: DemandGapType | "OPEN" | "LISTED";
  status?: DemandStatus;
  source?: DemandSource;
  city?: string;
  q?: string;
  days?: number;
  sort?: "score" | "requests" | "recent" | "buyers";
  page?: number;
  pageSize?: number;
}

export const demandApi = {
  overview: (days = 30) => request<DemandOverview>("/admin/demand/overview", { query: { days } }),
  gaps: (query: GapQuery = {}) => request<Paginated<DemandCluster>>("/admin/demand/gaps", { query: { ...query } }),
  gap: (id: string) => request<DemandClusterDetail>(`/admin/demand/gaps/${enc(id)}`),
  updateGap: (id: string, body: { status?: DemandStatus; note?: string | null; materialId?: string | null }) => request<DemandCluster>(`/admin/demand/gaps/${enc(id)}`, { method: "PATCH", body }),
  createMaterial: (id: string, body: CreateMaterialFromDemandPayload) => request<Material>(`/admin/demand/gaps/${enc(id)}/material`, { method: "POST", body }),
  launchList: (query: { city?: string; size?: number; freshDays?: number; status?: LaunchStatus } = {}) => request<LaunchList>("/admin/demand/launch-list", { query }),
  launchListCsvPath: () => "/admin/demand/launch-list.csv",
  refresh: () => request<{ updated: number; digest: { sent: boolean } }>("/admin/demand/refresh", { method: "POST", body: {} }),
};
