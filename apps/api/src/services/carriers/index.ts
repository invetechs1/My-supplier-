/**
 * Carrier adapter registry. One module per carrier (smsa.ts, aramex.ts, spl.ts, trukker.ts, trella.ts) describes the
 * carrier's API; `defineAdapter` (common.ts) adds the env-driven mode, sandbox fakes and webhook verification.
 *
 * Connecting a real carrier is configuration only: set the env vars listed in `adapter.env` (see .env.example and
 * docs/INTEGRATIONS.md "Carriers"). With CARRIER_SANDBOX=1 every configured adapter books deterministic "SBX-"
 * shipments without touching the network, so staging can exercise booking → tracking → label → cancel.
 * Without credentials a carrier is "manual": the supplier types the tracking number and updates status by hand
 * (or the carrier pushes updates to /shipping/webhooks/:carrier).
 */
import type { CarrierCode } from "@prisma/client";
import { type CarrierAdapter, type CarrierEnv, defineAdapter, mapGenericStatus, parseGenericWebhook, readEnv, verifyWebhookRequest } from "./common";
import { smsa } from "./smsa";
import { aramex } from "./aramex";
import { spl } from "./spl";
import { trukker } from "./trukker";
import { trella } from "./trella";

export * from "./common";

/** Own-fleet / other: never books online; webhooks still accepted (e.g. a supplier's own TMS) with the shared secret. */
function manualAdapter(code: CarrierCode): CarrierAdapter {
  const env: CarrierEnv = { required: [], optional: ["CARRIER_WEBHOOK_SECRET"] };
  const unsupported = async () => { throw new Error(`${code} is managed manually and has no carrier API`); };
  return {
    code, env, tracksBy: "trackingNumber", configured: () => false, mode: () => "manual", mapStatus: mapGenericStatus, parseWebhook: parseGenericWebhook,
    verifyWebhook: (req) => verifyWebhookRequest(readEnv("CARRIER_WEBHOOK_SECRET"), req),
    book: unsupported, track: async () => [], cancel: async () => ({ remote: false, note: "Manual shipment: nothing to cancel with a carrier" }), label: async () => null,
    ping: async () => ({ ok: false, detail: "Manual carrier: no API to test" }),
  };
}

export const adapters: Record<CarrierCode, CarrierAdapter> = {
  SUPPLIER: manualAdapter("SUPPLIER"),
  OTHER: manualAdapter("OTHER"),
  TRUKKER: defineAdapter(trukker),
  TRELLA: defineAdapter(trella),
  SMSA: defineAdapter(smsa),
  ARAMEX: defineAdapter(aramex),
  SPL: defineAdapter(spl),
};

export const adapterFor = (code: string): CarrierAdapter | undefined => adapters[code.toUpperCase() as CarrierCode];

/** Admin view of one carrier's integration state (never includes secret values). */
export function carrierStatus(code: CarrierCode, apiUrl: string) {
  const a = adapters[code];
  const set = (n: string) => readEnv(n) !== "";
  const webhookSecretName = a.env.optional.find((n) => n.endsWith("_WEBHOOK_SECRET")) ?? "CARRIER_WEBHOOK_SECRET";
  return {
    code,
    mode: a.mode(),
    configured: a.configured(),
    booksOnline: a.mode() !== "manual",
    env: { required: a.env.required.map((name) => ({ name, set: set(name) })), optional: a.env.optional.map((name) => ({ name, set: set(name) })) },
    missing: a.env.required.filter((n) => !set(n)),
    apiUrl: readEnv(`${code}_API_URL`) || null,
    webhookUrl: `${apiUrl.replace(/\/+$/, "")}/shipping/webhooks/${code.toLowerCase()}`,
    webhookSecretName,
    webhookSecured: set(webhookSecretName) || set("CARRIER_WEBHOOK_SECRET"),
  };
}
