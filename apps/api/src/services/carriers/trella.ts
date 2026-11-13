/**
 * Trella – heavy trucking marketplace (dyna / 7 t trucks up to full trailers). Bearer token (TRELLA_API_KEY) against the
 * shipper API base given at onboarding (TRELLA_API_URL; production default below). Loads are created under /loads.
 * Field names: see trucking.ts – confirm with Trella onboarding.
 */
import { truckingSpec } from "./trucking";

export const trella = truckingSpec({ code: "TRELLA", defaultBase: "https://api.trella.app/v1", path: "/loads" });
