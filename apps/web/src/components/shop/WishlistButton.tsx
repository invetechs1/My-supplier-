"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Wishlist } from "@mysupplier/shared";
import { errorMessage } from "@/lib/api";
import { marketplaceApi, removeMaterialFromLists } from "@/lib/api/marketplace";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { cn } from "@/lib/format";
import { Button, Input, Spinner } from "@/components/ui";

function HeartIcon({ filled, className }: { filled: boolean; className?: string }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("h-5 w-5", className)} aria-hidden>
      <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={cn("h-5 w-5", className)} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}

/**
 * Heart toggle (default list) plus a "Save to list…" menu to pick or create a list.
 * Guests get a link to sign in.
 */
export function WishlistButton({ materialId, listingId, quantity, className }: { materialId: string; listingId?: string | null; quantity?: number; className?: string }) {
  const { user } = useAuth();
  const { notify } = useCart();
  const [saved, setSaved] = useState(false);
  const [listIds, setListIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lists, setLists] = useState<Wishlist[] | null>(null);
  const [listsError, setListsError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const res = await marketplaceApi.wishlistContains(materialId);
      setSaved(res.saved);
      setListIds(res.wishlistIds);
    } catch {
      /* heart stays empty */
    }
  }, [materialId, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const loadLists = async () => {
    setListsError(null);
    try {
      setLists(await marketplaceApi.wishlists());
    } catch (err) {
      setListsError(errorMessage(err, "Could not load your lists."));
    }
  };

  const toggle = async () => {
    if (!user) return;
    setBusy(true);
    try {
      if (saved) {
        await removeMaterialFromLists(materialId, listIds);
        setSaved(false);
        setListIds([]);
        notify({ kind: "info", message: "Removed from your lists" });
      } else {
        await marketplaceApi.addWishlistItem("default", { materialId, listingId: listingId ?? undefined, quantity: quantity && quantity > 0 ? quantity : undefined });
        setSaved(true);
        notify({ kind: "success", message: "Saved to your list", actionHref: "/dashboard/lists", actionLabel: "View lists" });
        void refresh();
      }
    } catch (err) {
      notify({ kind: "error", message: errorMessage(err, "Could not update your list.") });
    } finally {
      setBusy(false);
    }
  };

  const saveTo = async (listId: string, name: string) => {
    setBusy(true);
    try {
      await marketplaceApi.addWishlistItem(listId, { materialId, listingId: listingId ?? undefined, quantity: quantity && quantity > 0 ? quantity : undefined });
      setSaved(true);
      setMenuOpen(false);
      notify({ kind: "success", message: `Saved to “${name}”`, actionHref: "/dashboard/lists", actionLabel: "View lists" });
      void refresh();
    } catch (err) {
      notify({ kind: "error", message: errorMessage(err, "Could not save to this list.") });
    } finally {
      setBusy(false);
    }
  };

  const createAndSave = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const list = await marketplaceApi.createWishlist(name);
      setNewName("");
      setLists((prev) => [...(prev ?? []), list]);
      await saveTo(list.id, list.name);
    } catch (err) {
      notify({ kind: "error", message: errorMessage(err, "Could not create the list.") });
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <Link href="/login" className={cn("inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50", className)} title="Sign in to save products">
        <HeartIcon filled={false} />
        Save
      </Link>
    );
  }

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={saved}
        aria-label={saved ? "Remove from saved items" : "Save to your list"}
        title={saved ? "Saved — click to remove" : "Save"}
        className={cn("inline-flex h-10 items-center gap-2 rounded-s-xl border border-slate-300 bg-white px-3 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-60", saved ? "text-red-600" : "text-slate-700")}
      >
        {busy ? <Spinner size="sm" className="text-current" /> : <HeartIcon filled={saved} />}
        <span className="hidden sm:inline">{saved ? "Saved" : "Save"}</span>
      </button>
      <button
        type="button"
        onClick={() => {
          setMenuOpen((o) => !o);
          if (!lists) void loadLists();
        }}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Save to list…"
        className="inline-flex h-10 items-center rounded-e-xl border border-s-0 border-slate-300 bg-white px-2 text-slate-600 hover:bg-slate-50"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {menuOpen && (
        <div role="menu" className="absolute end-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Save to list</p>
          {!lists && !listsError && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
              <Spinner size="sm" /> Loading lists…
            </div>
          )}
          {listsError && (
            <div className="px-4 py-3 text-sm text-red-600">
              {listsError}{" "}
              <button type="button" className="font-semibold underline" onClick={loadLists}>
                Retry
              </button>
            </div>
          )}
          {lists && (
            <ul className="max-h-56 overflow-y-auto py-1">
              {lists.map((l) => {
                const inList = listIds.includes(l.id);
                return (
                  <li key={l.id}>
                    <button type="button" role="menuitem" disabled={busy} onClick={() => saveTo(l.id, l.name)} className="flex w-full items-center justify-between gap-2 px-4 py-2 text-start text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                      <span className="truncate">
                        {l.name}
                        {l.isDefault && <span className="ms-1 text-xs text-slate-400">(default)</span>}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{inList ? "Saved" : `${l.itemCount ?? 0}`}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <form
            className="flex gap-2 border-t border-slate-100 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void createAndSave();
            }}
          >
            <Input name="new-list" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New list name" aria-label="New list name" maxLength={80} className="flex-1" />
            <Button type="submit" size="sm" disabled={busy || !newName.trim()}>
              Create
            </Button>
          </form>
          <Link href="/dashboard/lists" className="block border-t border-slate-100 px-4 py-2 text-xs font-semibold text-brand-700 hover:bg-slate-50" onClick={() => setMenuOpen(false)}>
            Manage lists →
          </Link>
        </div>
      )}
    </div>
  );
}
