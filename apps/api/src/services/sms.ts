import { env } from "../lib/env";

/**
 * SMS/WhatsApp sender. Unifonic (Saudi provider) when UNIFONIC_APP_SID is set; otherwise logs (development).
 * Any other provider (Twilio, Msegat, Taqnyat) can be added here without touching callers.
 */
export const smsEnabled = () => Boolean(process.env.UNIFONIC_APP_SID);

export async function sendSms(to: string, body: string): Promise<{ sent: boolean; channel: "SMS" | "DEV" }> {
  const sid = process.env.UNIFONIC_APP_SID;
  if (!sid) {
    if (!env.isProd) console.log(`[sms:dev] to=${to} body="${body}"`);
    return { sent: false, channel: "DEV" };
  }
  const resp = await fetch("https://el.cloud.unifonic.com/rest/SMS/messages", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ AppSid: sid, SenderID: process.env.UNIFONIC_SENDER_ID ?? "MySupplier", Recipient: to.replace(/^\+/, ""), Body: body }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`SMS provider responded ${resp.status}`);
  return { sent: true, channel: "SMS" };
}
