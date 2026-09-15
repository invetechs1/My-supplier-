import { prisma } from "../lib/prisma";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Sends a push notification to every registered device of the given users via Expo's push service. */
export async function sendPush(userIds: string[], message: PushMessage) {
  if (!userIds.length) return { sent: 0 };
  const devices = await prisma.device.findMany({ where: { userId: { in: userIds } } });
  if (!devices.length) return { sent: 0 };
  const messages = devices.map((d) => ({ to: d.token, sound: "default", title: message.title, body: message.body, data: message.data ?? {} }));
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) throw new Error(`Expo push HTTP ${resp.status}`);
      const json = (await resp.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };
      json.data?.forEach((ticket, idx) => {
        if (ticket.status === "ok") sent++;
        else if (ticket.details?.error === "DeviceNotRegistered") {
          prisma.device.delete({ where: { token: chunk[idx].to } }).catch(() => undefined);
        }
      });
    } catch (e) {
      console.error("push failed", (e as Error).message);
    }
  }
  return { sent };
}
