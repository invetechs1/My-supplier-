import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { api, paymentPageUrl } from "./api";

/** Deep link the hosted payment page redirects to when the gateway is done. */
export const PAYMENT_REDIRECT_URL = "mysupplier://payment";

export interface CardPaymentOutcome {
  orderId: string;
  /** "returned" = the browser came back to the app via the redirect; "dismissed" = user closed it */
  kind: "returned" | "dismissed" | "unavailable";
  paymentId?: string;
  status?: string;
}

/** Parse `mysupplier://payment?order=…&id=…&status=…` (or the https equivalent). */
export function parsePaymentRedirect(url: string): { orderId?: string; paymentId?: string; status?: string } {
  try {
    const parsed = Linking.parse(url);
    const q = (parsed.queryParams ?? {}) as Record<string, string | string[] | undefined>;
    const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
    return { orderId: one(q.order), paymentId: one(q.id), status: one(q.status) };
  } catch {
    return {};
  }
}

/**
 * Card checkout for one order: create the intent (server validates the order
 * and amount), then open the hosted Moyasar page in an auth session. The page
 * redirects to `mysupplier://payment?order=<id>&id=<paymentId>&status=…`, which
 * app/payment.tsx handles (verify + result screen). On web the page opens in a
 * new tab and the result lands on /payment through the browser redirect.
 */
export async function startCardPayment(orderId: string, jwt: string): Promise<CardPaymentOutcome> {
  await api.createPaymentIntent(orderId);
  const payUrl = paymentPageUrl(orderId, jwt);

  if (Platform.OS === "web") {
    await WebBrowser.openBrowserAsync(payUrl);
    return { orderId, kind: "unavailable" };
  }

  const redirectUrl = Linking.createURL("payment");
  const result = await WebBrowser.openAuthSessionAsync(payUrl, redirectUrl || PAYMENT_REDIRECT_URL, {
    preferEphemeralSession: false,
    showInRecents: true,
  });
  if (result.type === "success" && "url" in result && result.url) {
    const parsed = parsePaymentRedirect(result.url);
    return { orderId: parsed.orderId ?? orderId, kind: "returned", paymentId: parsed.paymentId, status: parsed.status };
  }
  return { orderId, kind: "dismissed" };
}
