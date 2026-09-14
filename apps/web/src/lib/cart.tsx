"use client";

import Link from "next/link";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { VAT_RATE, type Cart, type CartItem, type Material, type ShopOffer } from "@mysupplier/shared";
import { api, errorMessage } from "./api";
import { useAuth } from "./auth";
import { cn } from "./format";

export const LOCAL_CART_KEY = "ms_cart";
/** Client-side delivery estimate for guests (the API prices delivery per supplier). */
export const GUEST_DELIVERY_FEE_PER_SUPPLIER = 150;

export interface LocalCartItem {
  listingId: string;
  quantity: number;
  offer: ShopOffer;
  material: Material;
}

export interface AddContext {
  offer: ShopOffer;
  material: Material;
}

export interface ToastState {
  kind: "success" | "error" | "info";
  message: string;
  actionHref?: string;
  actionLabel?: string;
}

interface CartContextValue {
  /** Server cart when logged in, a client-side cart for guests. */
  cart: Cart | null;
  items: CartItem[];
  /** Number of distinct lines in the cart. */
  count: number;
  loading: boolean;
  busy: boolean;
  error: string | null;
  isGuest: boolean;
  add: (listingId: string, quantity: number, ctx?: AddContext) => Promise<boolean>;
  update: (itemId: string, quantity: number) => Promise<boolean>;
  remove: (itemId: string) => Promise<boolean>;
  clear: () => Promise<boolean>;
  reload: () => void;
  toast: ToastState | null;
  notify: (toast: ToastState | null) => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** MARKET rows are reference prices collected from feeds: visible, but not purchasable. */
export function isPurchasable(offer: ShopOffer | null | undefined): offer is ShopOffer {
  return !!offer && offer.source !== "MARKET" && !!offer.companyId;
}

export function supplierKey(offer: ShopOffer): string {
  return offer.companyId ?? `market:${offer.sourceName ?? offer.companyName}`;
}

export function minQtyFor(offer: ShopOffer | null | undefined): number {
  return Math.max(1, offer?.minQty ?? 1);
}

export function clampQty(offer: ShopOffer | null | undefined, qty: number): number {
  let q = Math.max(minQtyFor(offer), Math.floor(Number.isFinite(qty) ? qty : 1));
  if (offer && typeof offer.stock === "number" && offer.stock > 0) q = Math.min(q, Math.max(offer.stock, minQtyFor(offer)));
  return q;
}

function readLocal(): LocalCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_CART_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is LocalCartItem =>
        !!x && typeof x === "object" && typeof (x as LocalCartItem).listingId === "string" && !!(x as LocalCartItem).offer && !!(x as LocalCartItem).material,
    );
  } catch {
    return [];
  }
}

function writeLocal(items: LocalCartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    if (items.length === 0) window.localStorage.removeItem(LOCAL_CART_KEY);
    else window.localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(items));
  } catch {
    /* ignore storage failures */
  }
}

/** Build a Cart-shaped object for guests so the UI can render one shape everywhere. */
export function buildGuestCart(items: LocalCartItem[]): Cart {
  const cartItems: CartItem[] = items.map((it) => ({
    id: it.listingId,
    listingId: it.listingId,
    quantity: it.quantity,
    offer: it.offer,
    material: it.material,
    lineTotal: Math.round(it.offer.price * it.quantity * 100) / 100,
  }));
  const subtotal = cartItems.reduce((sum, it) => sum + it.lineTotal, 0);
  const suppliers = new Set(cartItems.map((it) => supplierKey(it.offer)));
  const vat = Math.round(subtotal * VAT_RATE * 100) / 100;
  const deliveryFee = suppliers.size * GUEST_DELIVERY_FEE_PER_SUPPLIER;
  return {
    id: "guest",
    items: cartItems,
    subtotal: Math.round(subtotal * 100) / 100,
    vat,
    deliveryFee,
    total: Math.round((subtotal + vat + deliveryFee) * 100) / 100,
    supplierCount: suppliers.size,
    currency: "SAR",
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [serverCart, setServerCart] = useState<Cart | null>(null);
  const [localItems, setLocalItems] = useState<LocalCartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [toast, setToastState] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const merging = useRef(false);

  const notify = useCallback((next: ToastState | null) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastState(next);
    if (next) toastTimer.current = setTimeout(() => setToastState(null), 3500);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  // Hydrate the guest cart from localStorage once on the client.
  useEffect(() => {
    setLocalItems(readLocal());
  }, []);

  const persistLocal = useCallback((next: LocalCartItem[]) => {
    setLocalItems(next);
    writeLocal(next);
  }, []);

  // Load the server cart when logged in; merge any guest cart first.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setServerCart(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      const pending = readLocal();
      if (pending.length > 0 && !merging.current) {
        merging.current = true;
        const failures: string[] = [];
        for (const it of pending) {
          try {
            await api.addCartItem(it.listingId, it.quantity);
          } catch (err) {
            failures.push(`${it.material.name}: ${errorMessage(err)}`);
          }
        }
        writeLocal([]);
        if (active) setLocalItems([]);
        merging.current = false;
        if (failures.length > 0 && active) {
          notify({ kind: "error", message: `Some saved items could not be added: ${failures.slice(0, 2).join("; ")}${failures.length > 2 ? "…" : ""}` });
        }
      }
      try {
        const c = await api.cart();
        if (active) setServerCart(c);
      } catch (err) {
        if (active) setError(errorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [userId, authLoading, tick, notify]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const runServer = useCallback(
    async (fn: () => Promise<Cart>, successMessage?: ToastState): Promise<boolean> => {
      setBusy(true);
      try {
        const c = await fn();
        setServerCart(c);
        setError(null);
        if (successMessage) notify(successMessage);
        return true;
      } catch (err) {
        notify({ kind: "error", message: errorMessage(err) });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  const addedToast: ToastState = useMemo(() => ({ kind: "success", message: "Added to cart", actionHref: "/cart", actionLabel: "View cart" }), []);

  const add = useCallback<CartContextValue["add"]>(
    async (listingId, quantity, ctx) => {
      if (userId) return runServer(() => api.addCartItem(listingId, quantity), addedToast);
      if (!ctx) {
        notify({ kind: "error", message: "Please sign in to add this item." });
        return false;
      }
      if (!isPurchasable(ctx.offer)) {
        notify({ kind: "error", message: "This is a reference price and cannot be ordered." });
        return false;
      }
      const current = readLocal();
      const idx = current.findIndex((x) => x.listingId === listingId);
      const next = [...current];
      if (idx >= 0) {
        const merged = clampQty(ctx.offer, next[idx].quantity + quantity);
        next[idx] = { ...next[idx], quantity: merged, offer: ctx.offer, material: ctx.material };
      } else {
        next.push({ listingId, quantity: clampQty(ctx.offer, quantity), offer: ctx.offer, material: ctx.material });
      }
      persistLocal(next);
      notify(addedToast);
      return true;
    },
    [userId, runServer, addedToast, notify, persistLocal],
  );

  const update = useCallback<CartContextValue["update"]>(
    async (itemId, quantity) => {
      if (userId) return runServer(() => api.updateCartItem(itemId, quantity));
      const current = readLocal();
      const next = current.map((x) => (x.listingId === itemId ? { ...x, quantity: clampQty(x.offer, quantity) } : x));
      persistLocal(next);
      return true;
    },
    [userId, runServer, persistLocal],
  );

  const remove = useCallback<CartContextValue["remove"]>(
    async (itemId) => {
      if (userId) return runServer(() => api.removeCartItem(itemId));
      persistLocal(readLocal().filter((x) => x.listingId !== itemId));
      return true;
    },
    [userId, runServer, persistLocal],
  );

  const clear = useCallback<CartContextValue["clear"]>(async () => {
    if (userId) return runServer(() => api.clearCart());
    persistLocal([]);
    return true;
  }, [userId, runServer, persistLocal]);

  const isGuest = !userId;
  const cart = useMemo<Cart | null>(() => (isGuest ? buildGuestCart(localItems) : serverCart), [isGuest, localItems, serverCart]);
  const items = useMemo<CartItem[]>(() => cart?.items ?? [], [cart]);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      items,
      count: items.length,
      loading: authLoading || (!isGuest && loading),
      busy,
      error,
      isGuest,
      add,
      update,
      remove,
      clear,
      reload,
      toast,
      notify,
    }),
    [cart, items, authLoading, isGuest, loading, busy, error, add, update, remove, clear, reload, toast, notify],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      <CartToast toast={toast} onClose={() => notify(null)} />
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function CartToast({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  if (!toast) return null;
  const tone =
    toast.kind === "success" ? "border-emerald-200 bg-white text-slate-900" : toast.kind === "error" ? "border-red-200 bg-white text-red-800" : "border-slate-200 bg-white text-slate-900";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4" role="status" aria-live="polite">
      <div className={cn("pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-xl", tone)}>
        {toast.kind === "success" && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          </span>
        )}
        <span className="font-medium">{toast.message}</span>
        {toast.actionHref && (
          <Link href={toast.actionHref} onClick={onClose} className="font-semibold text-brand-700 hover:underline">
            {toast.actionLabel ?? "View"}
          </Link>
        )}
        <button type="button" onClick={onClose} aria-label="Dismiss" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
