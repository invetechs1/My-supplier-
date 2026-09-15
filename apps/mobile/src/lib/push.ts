import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { api } from "./api";
import { storage } from "./storage";

const PUSH_TOKEN_KEY = "mysupplier.pushToken";

type NotificationsModule = typeof import("expo-notifications");
type DeviceModule = typeof import("expo-device");

/**
 * expo-notifications and expo-device are loaded lazily and only on native so
 * the web bundle never touches them (they throw on web / in Expo Go for SDK 53+).
 */
function loadNotifications(): NotificationsModule | null {
  if (Platform.OS === "web") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("expo-notifications") as NotificationsModule;
  } catch {
    return null;
  }
}

function loadDevice(): DeviceModule | null {
  if (Platform.OS === "web") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("expo-device") as DeviceModule;
  } catch {
    return null;
  }
}

let handlerConfigured = false;

/** Show alerts/badges while the app is in the foreground (native only). */
export function configureNotificationHandler(): void {
  if (handlerConfigured) return;
  const Notifications = loadNotifications();
  if (!Notifications) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync("default", {
      name: "Orders, RFQs & bids",
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: "#0B6E4F",
    }).catch(() => undefined);
  }
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const fromEas = extra?.eas?.projectId;
  if (fromEas) return fromEas;
  const easConfig = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig;
  return easConfig?.projectId || undefined;
}

/**
 * Ask for permission (real devices only), fetch the Expo push token and
 * register it with the API. Safe to call repeatedly; failures are swallowed
 * because push is best-effort. Resolves to the token or null.
 */
export async function registerForPushAsync(apiToken: string | null): Promise<string | null> {
  if (!apiToken || Platform.OS === "web") return null;
  const Notifications = loadNotifications();
  const Device = loadDevice();
  if (!Notifications || !Device || !Device.isDevice) return null;
  try {
    configureNotificationHandler();
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== "granted") {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== "granted") return null;

    const id = projectId();
    const { data: token } = await Notifications.getExpoPushTokenAsync(id ? { projectId: id } : undefined);
    if (!token) return null;

    await api.registerDevice({ token, platform: Platform.OS === "ios" ? "ios" : "android" });
    await storage.setItem(PUSH_TOKEN_KEY, token);
    return token;
  } catch {
    return null;
  }
}

/** Forget this device on the API (called on logout, while the JWT is still valid). */
export async function unregisterPushAsync(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const token = await storage.getItem(PUSH_TOKEN_KEY);
    if (!token) return;
    await api.unregisterDevice(token).catch(() => undefined);
    await storage.deleteItem(PUSH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Map a notification `link` from the API / web app to an app route.
 *  - /dashboard/orders/:id                       -> /order/:id
 *  - /supplier/marketplace/:id, /dashboard/rfqs/:id -> /rfq/:id
 *  - anything else                               -> /notifications
 */
export function routeForNotificationLink(link: unknown): string {
  if (typeof link !== "string" || !link) return "/notifications";
  const order = link.match(/orders?\/([\w-]+)/);
  if (order) return `/order/${order[1]}`;
  const rfq = link.match(/(?:marketplace|rfqs?)\/([\w-]+)/);
  if (rfq) return `/rfq/${rfq[1]}`;
  const material = link.match(/materials?\/([\w-]+)/);
  if (material) return `/material/${material[1]}`;
  const product = link.match(/products?\/([\w-]+)/);
  if (product) return `/shop/product/${product[1]}`;
  return "/notifications";
}

/**
 * Navigate when the user taps a notification (app running or cold start).
 * Mount once in the root layout.
 */
export function useNotificationTapHandler(): void {
  const router = useRouter();
  useEffect(() => {
    const Notifications = loadNotifications();
    if (!Notifications) return;
    configureNotificationHandler();

    const open = (response: import("expo-notifications").NotificationResponse | null | undefined) => {
      const data = response?.notification?.request?.content?.data as { link?: unknown } | undefined;
      const target = routeForNotificationLink(data?.link);
      // Defer so the navigator is mounted on cold start.
      setTimeout(() => router.push(target as never), 0);
    };

    let cancelled = false;
    Notifications.getLastNotificationResponseAsync()
      .then((res) => {
        if (!cancelled && res) open(res);
      })
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [router]);
}
