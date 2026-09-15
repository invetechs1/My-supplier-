import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { storage } from "./storage";
import { VAT_RATE, type Cart, type CartItem, type Material, type ShopOffer } from "@mysupplier/shared";
import { api } from "./api";
import { useAuth } from "./auth";
import { colors, radius, spacing } from "@/theme";

/** Flat delivery estimate per supplier used for guest carts (server computes the real fee). */
export const GUEST_DELIVERY_FEE_PER_SUPPLIER = 150;
const GUEST_CART_KEY = "mysupplier.cart.guest";

/** Line kept locally for guests (mirrors what POST /cart/items needs plus display data). */
export interface LocalCartItem {
  listingId: string;
  quantity: number;
  offer: ShopOffer;
  material: Material;
}

export interface CartSummary {
  subtotal: number;
  vat: number;
  deliveryFee: number;
  total: number;
  supplierCount: number;
  /** true when totals are computed on-device (guest) rather than by the API */
  estimated: boolean;
}

export interface CartGroup {
  key: string;
  supplierName: string;
  verified: boolean;
  city: string;
  items: CartItem[];
  subtotal: number;
}

interface CartContextValue {
  items: CartItem[];
  groups: CartGroup[];
  summary: CartSummary;
  /** Number of distinct lines – used for the tab badge. */
  count: number;
  loading: boolean;
  busy: boolean;
  error: string | null;
  isGuest: boolean;
  addItem: (offer: ShopOffer, material: Material, quantity: number) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
  quantityFor: (listingId: string) => number;
  showToast: (message: string) => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

// Persistence helpers ---------------------------------------------------------

/** Keep only what the cart screens render so the payload stays small for SecureStore. */
function slimMaterial(m: Material): Material {
  return {
    id: m.id,
    sku: m.sku,
    name: m.name,
    nameAr: m.nameAr,
    unit: m.unit,
    categoryId: m.categoryId,
    category: m.category ? { id: m.category.id, slug: m.category.slug, name: m.category.name, nameAr: m.category.nameAr, icon: m.category.icon } : undefined,
    brand: m.brand ?? null,
    imageUrl: m.imageUrl ?? null,
    avgPrice: m.avgPrice ?? null,
  };
}

async function readGuestCart(): Promise<LocalCartItem[]> {
  try {
    const raw = await storage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is LocalCartItem =>
        Boolean(x) && typeof x === "object" && typeof (x as LocalCartItem).listingId === "string" && Boolean((x as LocalCartItem).offer) && Boolean((x as LocalCartItem).material),
    );
  } catch {
    return [];
  }
}

async function writeGuestCart(items: LocalCartItem[]): Promise<void> {
  try {
    if (items.length === 0) await storage.deleteItem(GUEST_CART_KEY);
    else await storage.setItem(GUEST_CART_KEY, JSON.stringify(items));
  } catch {
    // SecureStore unavailable (web / private mode): keep the in-memory cart only.
  }
}

function localToCartItems(local: LocalCartItem[]): CartItem[] {
  return local.map((l) => ({
    id: `local:${l.listingId}`,
    listingId: l.listingId,
    quantity: l.quantity,
    offer: l.offer,
    material: l.material,
    lineTotal: round2(l.offer.price * l.quantity),
  }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function supplierKey(offer: ShopOffer): string {
  return offer.companyId ?? `market:${offer.sourceName ?? offer.companyName}`;
}

export function groupBySupplier(items: CartItem[]): CartGroup[] {
  const map = new Map<string, CartGroup>();
  items.forEach((item) => {
    const key = supplierKey(item.offer);
    const existing = map.get(key);
    if (existing) {
      existing.items.push(item);
      existing.subtotal = round2(existing.subtotal + item.lineTotal);
    } else {
      map.set(key, {
        key,
        supplierName: item.offer.companyName,
        verified: item.offer.verified,
        city: item.offer.city,
        items: [item],
        subtotal: item.lineTotal,
      });
    }
  });
  return Array.from(map.values());
}

export function estimateSummary(items: CartItem[]): CartSummary {
  const subtotal = round2(items.reduce((sum, i) => sum + i.lineTotal, 0));
  const supplierCount = new Set(items.map((i) => supplierKey(i.offer))).size;
  const vat = round2(subtotal * VAT_RATE);
  const deliveryFee = supplierCount * GUEST_DELIVERY_FEE_PER_SUPPLIER;
  return { subtotal, vat, deliveryFee, total: round2(subtotal + vat + deliveryFee), supplierCount, estimated: true };
}

// Provider --------------------------------------------------------------------

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [serverCart, setServerCart] = useState<Cart | null>(null);
  const [localItems, setLocalItems] = useState<LocalCartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const localRef = useRef<LocalCartItem[]>([]);
  const wasAuthenticated = useRef<boolean | null>(null);

  const setLocal = useCallback((next: LocalCartItem[]) => {
    localRef.current = next;
    setLocalItems(next);
    void writeGuestCart(next);
  }, []);

  const loadServerCart = useCallback(async () => {
    try {
      const cart = await api.cart();
      setServerCart(cart);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load cart");
    }
  }, []);

  // Bootstrap the guest cart from storage once.
  useEffect(() => {
    let cancelled = false;
    readGuestCart().then((items) => {
      if (cancelled) return;
      localRef.current = items;
      setLocalItems(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // React to auth changes: merge the guest cart into the server cart on login,
  // drop the server cart on logout.
  useEffect(() => {
    if (authLoading) return;
    const prev = wasAuthenticated.current;
    wasAuthenticated.current = isAuthenticated;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (isAuthenticated) {
          const pending = localRef.current.length ? localRef.current : await readGuestCart();
          if (pending.length) {
            for (const item of pending) {
              try {
                await api.addCartItem(item.listingId, item.quantity);
              } catch {
                // Skip lines the server rejects (stale listing, stock); the rest still merge.
              }
            }
            if (!cancelled) setLocal([]);
          }
          if (!cancelled) await loadServerCart();
        } else if (prev !== false) {
          setServerCart(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authLoading, loadServerCart, setLocal]);

  const showToast = useCallback((message: string) => {
    setToast({ id: Date.now(), message });
  }, []);

  const items = useMemo<CartItem[]>(
    () => (isAuthenticated ? serverCart?.items ?? [] : localToCartItems(localItems)),
    [isAuthenticated, serverCart, localItems],
  );

  const summary = useMemo<CartSummary>(() => {
    if (isAuthenticated && serverCart) {
      return {
        subtotal: serverCart.subtotal,
        vat: serverCart.vat,
        deliveryFee: serverCart.deliveryFee,
        total: serverCart.total,
        supplierCount: serverCart.supplierCount,
        estimated: false,
      };
    }
    return estimateSummary(items);
  }, [isAuthenticated, serverCart, items]);

  const groups = useMemo(() => groupBySupplier(items), [items]);

  const withBusy = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }, []);

  const addItem = useCallback(
    async (offer: ShopOffer, material: Material, quantity: number) => {
      const qty = Math.max(1, Math.max(offer.minQty || 1, Math.round(quantity)));
      await withBusy(async () => {
        if (isAuthenticated) {
          const cart = await api.addCartItem(offer.listingId, qty);
          setServerCart(cart);
        } else {
          const current = localRef.current;
          const idx = current.findIndex((l) => l.listingId === offer.listingId);
          const next =
            idx >= 0
              ? current.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + qty } : l))
              : [...current, { listingId: offer.listingId, quantity: qty, offer, material: slimMaterial(material) }];
          setLocal(next);
        }
      });
    },
    [isAuthenticated, setLocal, withBusy],
  );

  const updateQuantity = useCallback(
    async (itemId: string, quantity: number) => {
      const qty = Math.max(1, Math.round(quantity));
      await withBusy(async () => {
        if (isAuthenticated) {
          const cart = await api.updateCartItem(itemId, qty);
          setServerCart(cart);
        } else {
          const listingId = itemId.replace(/^local:/, "");
          setLocal(localRef.current.map((l) => (l.listingId === listingId ? { ...l, quantity: qty } : l)));
        }
      });
    },
    [isAuthenticated, setLocal, withBusy],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      await withBusy(async () => {
        if (isAuthenticated) {
          const cart = await api.removeCartItem(itemId);
          setServerCart(cart);
        } else {
          const listingId = itemId.replace(/^local:/, "");
          setLocal(localRef.current.filter((l) => l.listingId !== listingId));
        }
      });
    },
    [isAuthenticated, setLocal, withBusy],
  );

  const clear = useCallback(async () => {
    await withBusy(async () => {
      if (isAuthenticated) {
        const cart = await api.clearCart();
        setServerCart(cart);
      } else {
        setLocal([]);
      }
    });
  }, [isAuthenticated, setLocal, withBusy]);

  const refresh = useCallback(async () => {
    if (isAuthenticated) await loadServerCart();
    else {
      const stored = await readGuestCart();
      localRef.current = stored;
      setLocalItems(stored);
    }
  }, [isAuthenticated, loadServerCart]);

  const quantityFor = useCallback(
    (listingId: string) => items.find((i) => i.listingId === listingId)?.quantity ?? 0,
    [items],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      groups,
      summary,
      count: items.length,
      // Also "loading" while logged in but the first GET /cart has not landed yet,
      // so screens do not flash an empty cart right after login.
      loading: loading || authLoading || (isAuthenticated && serverCart === null && !error),
      busy,
      error,
      isGuest: !isAuthenticated,
      addItem,
      updateQuantity,
      removeItem,
      clear,
      refresh,
      quantityFor,
      showToast,
    }),
    [items, groups, summary, loading, authLoading, busy, error, isAuthenticated, addItem, updateQuantity, removeItem, clear, refresh, quantityFor, showToast],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      <Toast toast={toast} onHide={() => setToast(null)} />
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

// Toast -----------------------------------------------------------------------

function Toast({ toast, onHide }: { toast: { id: number; message: string } | null; onHide: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState<{ id: number; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    setVisible(toast);
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
        if (finished) {
          setVisible(null);
          onHide();
        }
      });
    }, 1800);
    return () => clearTimeout(timer);
  }, [toast, opacity, onHide]);

  if (!visible) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.toastWrap, { opacity }]}>
      <View style={styles.toast}>
        <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
        <Text style={styles.toastText}>{visible.message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastWrap: { position: "absolute", left: 0, right: 0, bottom: 96, alignItems: "center" },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    maxWidth: "85%",
  },
  toastText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});
