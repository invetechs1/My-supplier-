import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Small key/value store: expo-secure-store on iOS/Android, `localStorage` on
 * web (SecureStore is not implemented there). Every call swallows errors so a
 * missing keychain / private-mode browser never crashes the app.
 */

function webStorage(): Storage | null {
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      return (globalThis as unknown as { localStorage: Storage }).localStorage;
    }
  } catch {
    // access can throw in sandboxed iframes
  }
  return null;
}

export async function getItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") return webStorage()?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      webStorage()?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch {
    // ignore
  }
}

export async function deleteItem(key: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      webStorage()?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
}

export const storage = { getItem, setItem, deleteItem };
