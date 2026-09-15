import { env } from "../lib/env";

export const cardPaymentsEnabled = () => Boolean(env.moyasar.secretKey && env.moyasar.publishableKey);

export interface MoyasarPayment {
  id: string;
  status: "initiated" | "paid" | "failed" | "authorized" | "captured" | "refunded" | "voided";
  amount: number; // halalas
  currency: string;
  description?: string;
  source?: { type?: string; company?: string; message?: string };
  metadata?: Record<string, string>;
}

/** Fetches a payment from Moyasar with the secret key (server-side verification). */
export async function fetchMoyasarPayment(paymentId: string): Promise<MoyasarPayment> {
  const auth = Buffer.from(`${env.moyasar.secretKey}:`).toString("base64");
  const resp = await fetch(`${env.moyasar.apiBase}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: `Basic ${auth}`, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`Moyasar responded ${resp.status}`);
  return (await resp.json()) as MoyasarPayment;
}

export const toHalalas = (sar: number) => Math.round(sar * 100);

/** Refunds a Moyasar payment (full or partial, amount in halalas). */
export async function refundMoyasarPayment(paymentId: string, amountHalalas?: number): Promise<MoyasarPayment & { refunded?: number }> {
  const auth = Buffer.from(`${env.moyasar.secretKey}:`).toString("base64");
  const resp = await fetch(`${env.moyasar.apiBase}/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(amountHalalas ? { amount: amountHalalas } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Moyasar refund failed (${resp.status}) ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as MoyasarPayment & { refunded?: number };
}
