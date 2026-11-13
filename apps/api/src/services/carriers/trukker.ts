/**
 * TruKKer – heavy trucking marketplace (flatbeds, trailers, dynas across KSA). Bearer token (TRUKKER_API_KEY) against the
 * partner API base given at onboarding (TRUKKER_API_URL; production default below). Loads are created under /shipments.
 * Field names: see trucking.ts – confirm with TruKKer onboarding.
 */
import { truckingSpec } from "./trucking";

export const trukker = truckingSpec({ code: "TRUKKER", defaultBase: "https://api.trukker.com/v1", path: "/shipments", trackingUrl: (id) => `https://track.trukker.com/${encodeURIComponent(id)}` });
