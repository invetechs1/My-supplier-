"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Wishlist, WishlistItem } from "@mysupplier/shared";
import { errorMessage } from "@/lib/api";
import { asPriced, marketplaceApi } from "@/lib/api/marketplace";
import { isPurchasable, useCart } from "@/lib/cart";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate, formatSar } from "@/lib/format";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, FlashMessage, Input, LinkButton, LoadingBlock, Modal, PageHeader } from "@/components/ui";
import { ProductImage, StockPill } from "@/components/shop/ProductCard";

// ---------------------------------------------------------------------------
// Items table row (quantity + note editing)
// ---------------------------------------------------------------------------

function ItemRow({ item, listId, onChange, onRemove }: { item: WishlistItem; listId: string; onChange: (next: WishlistItem) => void; onRemove: (id: string) => void }) {
  const { lang, t } = useI18n();
  const { add, busy: cartBusy } = useCart();
  const [qty, setQty] = useState(String(item.quantity));
  const [note, setNote] = useState(item.note ?? "");
  const [editingNote, setEditingNote] = useState(false);
  const [saving, setSaving] = useState<"qty" | "note" | "remove" | "cart" | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setQty(String(item.quantity)), [item.quantity]);
  useEffect(() => setNote(item.note ?? ""), [item.note]);

  const m = item.material;
  const offer = asPriced(m?.bestOffer);
  const name = m ? (lang === "ar" ? m.nameAr || m.name : m.name) : "Product unavailable";
  const purchasable = isPurchasable(offer);
  const subtotal = offer ? offer.effectivePrice * item.quantity : null;

  const patch = async (kind: "qty" | "note", body: { quantity?: number; note?: string | null }) => {
    setSaving(kind);
    setError(null);
    try {
      const updated = await marketplaceApi.updateWishlistItem(listId, item.id, body);
      onChange({ ...item, ...updated, material: item.material });
    } catch (err) {
      setError(errorMessage(err, "Could not update the item."));
      setQty(String(item.quantity));
      setNote(item.note ?? "");
    } finally {
      setSaving(null);
    }
  };

  const commitQty = () => {
    const n = Math.max(1, Math.floor(Number(qty) || 0));
    if (!n || n === item.quantity) {
      setQty(String(item.quantity));
      return;
    }
    void patch("qty", { quantity: n });
  };

  const commitNote = () => {
    setEditingNote(false);
    const next = note.trim();
    if (next === (item.note ?? "")) return;
    void patch("note", { note: next || null });
  };

  const remove = async () => {
    setSaving("remove");
    try {
      await marketplaceApi.removeWishlistItem(listId, item.id);
      onRemove(item.id);
    } catch (err) {
      setError(errorMessage(err, "Could not remove the item."));
      setSaving(null);
    }
  };

  const addOne = async () => {
    if (!m || !offer || !purchasable) return;
    setSaving("cart");
    try {
      await add(offer.listingId, Math.max(item.quantity, offer.minQty), { offer, material: m });
    } finally {
      setSaving(null);
    }
  };

  return (
    <li className="grid gap-3 px-5 py-4 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-start">
      <Link href={m ? `/shop/products/${m.id}` : "#"} className="block h-16 w-16 rounded-lg bg-slate-50 p-1">
        {m ? <ProductImage material={m} /> : <span className="block h-full w-full rounded bg-slate-100" aria-hidden />}
      </Link>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={m ? `/shop/products/${m.id}` : "#"} className="font-medium text-slate-900 hover:text-brand-700">
            {name}
          </Link>
          {m?.brand && <span className="text-xs text-slate-500">{m.brand}</span>}
          <StockPill offer={offer} inStock={m?.inStock} />
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {m ? `SKU ${m.sku} · per ${m.unit}` : ""} · Saved {formatDate(item.createdAt, lang)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="inline-flex items-center gap-2 text-slate-600">
            <span>Qty</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onBlur={commitQty}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              disabled={saving === "qty"}
              aria-label={`Quantity for ${name}`}
              dir="ltr"
              className="h-8 w-20 rounded-lg border border-slate-300 px-2 text-center text-sm tabular-nums focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:opacity-60"
            />
            {m && <span className="text-xs text-slate-400">{m.unit}</span>}
          </label>
          {offer ? (
            <span className="text-slate-600">
              Best offer <span className="font-semibold tabular-nums text-slate-900">{formatSar(offer.effectivePrice, lang)}</span>
              {offer.compareAtPrice && offer.compareAtPrice > offer.effectivePrice && <s className="ms-1 text-xs tabular-nums text-slate-400">{formatSar(offer.compareAtPrice, lang)}</s>}
              <span className="text-xs text-slate-400"> · {offer.companyName}</span>
              {subtotal !== null && (
                <span className="ms-2 text-xs text-slate-500">
                  = <span className="tabular-nums">{formatSar(subtotal, lang)}</span>
                </span>
              )}
            </span>
          ) : (
            <span className="text-xs text-slate-400">No offer right now</span>
          )}
        </div>
        <div className="mt-2 text-sm">
          {editingNote ? (
            <input
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={commitNote}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitNote();
                if (e.key === "Escape") {
                  setNote(item.note ?? "");
                  setEditingNote(false);
                }
              }}
              maxLength={500}
              placeholder="Add a note (site, phase, spec…)"
              aria-label={`Note for ${name}`}
              className="h-8 w-full max-w-md rounded-lg border border-slate-300 px-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
          ) : (
            <button type="button" onClick={() => setEditingNote(true)} className={cn("rounded px-1 text-start hover:bg-slate-100", item.note ? "text-slate-700" : "text-xs text-slate-400")}>
              {item.note ? item.note : "+ Add note"}
              {saving === "note" && <span className="ms-2 text-xs text-slate-400">Saving…</span>}
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <div className="flex gap-2 sm:flex-col sm:items-end">
        <Button size="sm" variant="outline" onClick={addOne} loading={saving === "cart"} disabled={!purchasable || cartBusy} title={purchasable ? undefined : "No purchasable offer"}>
          {t("shop.addToCart")}
        </Button>
        <Button size="sm" variant="ghost" onClick={remove} loading={saving === "remove"} className="text-red-600 hover:bg-red-50">
          Remove
        </Button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ListsPage() {
  const { lang } = useI18n();
  const { reload: reloadCart, deliveryCity } = useCart();
  const lists = useAsync(() => marketplaceApi.wishlists(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useFlash(6000);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<"create" | "rename" | "delete" | "cart" | null>(null);

  // Select the default list once lists arrive (or keep the current one if it still exists).
  useEffect(() => {
    const all = lists.data ?? [];
    if (all.length === 0) return;
    if (!selectedId || !all.some((l) => l.id === selectedId)) setSelectedId((all.find((l) => l.isDefault) ?? all[0]).id);
  }, [lists.data, selectedId]);

  const detail = useAsync(() => marketplaceApi.wishlist(selectedId!, deliveryCity || undefined), [selectedId, deliveryCity], !!selectedId);
  const selected = (lists.data ?? []).find((l) => l.id === selectedId) ?? null;
  const items = detail.data?.items ?? [];

  const updateCount = (id: string, delta: number) => lists.setData((prev) => (prev ? prev.map((l) => (l.id === id ? { ...l, itemCount: Math.max(0, (l.itemCount ?? 0) + delta) } : l)) : prev));

  const createList = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy("create");
    try {
      const list = await marketplaceApi.createWishlist(name);
      lists.setData((prev) => [...(prev ?? []), list]);
      setSelectedId(list.id);
      setNewName("");
      setCreating(false);
      setFlash({ kind: "success", message: `List “${list.name}” created.` });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err, "Could not create the list.") });
    } finally {
      setBusy(null);
    }
  };

  const renameList = async () => {
    if (!selected) return;
    const name = renameValue.trim();
    if (!name || name === selected.name) {
      setRenaming(false);
      return;
    }
    setBusy("rename");
    try {
      const updated = await marketplaceApi.renameWishlist(selected.id, name);
      lists.setData((prev) => (prev ? prev.map((l) => (l.id === updated.id ? { ...l, name: updated.name } : l)) : prev));
      setRenaming(false);
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err, "Could not rename the list.") });
    } finally {
      setBusy(null);
    }
  };

  const deleteList = async () => {
    if (!selected) return;
    setBusy("delete");
    try {
      await marketplaceApi.deleteWishlist(selected.id);
      lists.setData((prev) => (prev ? prev.filter((l) => l.id !== selected.id) : prev));
      setSelectedId(null);
      setConfirmDelete(false);
      setFlash({ kind: "success", message: `List “${selected.name}” deleted.` });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err, "Could not delete the list.") });
    } finally {
      setBusy(null);
    }
  };

  const addAllToCart = async () => {
    if (!selected) return;
    setBusy("cart");
    try {
      const res = await marketplaceApi.wishlistToCart(selected.id, deliveryCity || undefined);
      reloadCart();
      if (res.added === 0) {
        setFlash({ kind: "error", message: res.skipped.length ? `Nothing added — ${res.skipped[0].reason}${res.skipped.length > 1 ? ` (and ${res.skipped.length - 1} more)` : ""}.` : "This list is empty." });
      } else {
        const skippedNames = res.skipped.map((s) => items.find((it) => it.materialId === s.materialId)?.material?.name ?? "1 item");
        setFlash({
          kind: "success",
          message: `Added ${res.added} ${res.added === 1 ? "item" : "items"} to your cart.${res.skipped.length ? ` Skipped ${res.skipped.length}: ${skippedNames.slice(0, 2).join(", ")}${res.skipped.length > 2 ? "…" : ""}.` : ""}`,
        });
      }
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err, "Could not add the list to your cart.") });
    } finally {
      setBusy(null);
    }
  };

  const total = items.reduce((sum, it) => {
    const o = asPriced(it.material?.bestOffer);
    return sum + (o ? o.effectivePrice * it.quantity : 0);
  }, 0);
  const purchasableCount = items.filter((it) => isPurchasable(it.material?.bestOffer)).length;

  const listButton = (l: Wishlist) => (
    <button
      key={l.id}
      type="button"
      onClick={() => setSelectedId(l.id)}
      aria-current={l.id === selectedId ? "page" : undefined}
      className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm transition", l.id === selectedId ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-700 hover:bg-slate-100")}
    >
      <span className="truncate">
        {l.name}
        {l.isDefault && <span className="ms-1 text-[11px] font-normal text-slate-400">default</span>}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-slate-400">{l.itemCount ?? 0}</span>
    </button>
  );

  return (
    <div>
      <PageHeader
        title="Saved lists"
        subtitle="Keep project lists, add notes and quantities, then send a whole list to the cart in one click."
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            + New list
          </Button>
        }
      />
      <FlashMessage flash={flash} className="mb-4" />

      {lists.loading && !lists.data ? (
        <LoadingBlock className="min-h-[40vh]" />
      ) : lists.error ? (
        <Alert onRetry={lists.reload}>{lists.error}</Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Card className="h-fit p-3">
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Your lists</p>
            <nav className="space-y-0.5" aria-label="Lists">
              {(lists.data ?? []).map(listButton)}
            </nav>
            <button type="button" onClick={() => setCreating(true)} className="mt-2 w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-700">
              + Create a list
            </button>
          </Card>

          <div className="min-w-0">
            {!selected ? (
              <Card>
                <EmptyState title="Pick a list" description="Choose a list on the left or create a new one." />
              </Card>
            ) : (
              <Card>
                <CardHeader
                  title={
                    renaming ? (
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void renameList();
                        }}
                      >
                        <Input name="rename" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={80} autoFocus aria-label="List name" className="w-56" />
                        <Button type="submit" size="sm" loading={busy === "rename"}>
                          Save
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(false)}>
                          Cancel
                        </Button>
                      </form>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        {selected.name}
                        {selected.isDefault && <Badge tone="slate">Default</Badge>}
                      </span>
                    )
                  }
                  subtitle={`${items.length} ${items.length === 1 ? "item" : "items"}${total > 0 ? ` · ${formatSar(total, lang)} at today's best prices (excl. VAT)` : ""}`}
                  action={
                    <>
                      {!selected.isDefault && !renaming && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRenameValue(selected.name);
                              setRenaming(true);
                            }}
                          >
                            Rename
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
                            Delete
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="accent" onClick={addAllToCart} loading={busy === "cart"} disabled={purchasableCount === 0} title={purchasableCount === 0 ? "No item has a purchasable offer" : undefined}>
                        Add all to cart{purchasableCount > 0 ? ` (${purchasableCount})` : ""}
                      </Button>
                    </>
                  }
                />
                {detail.loading && !detail.data ? (
                  <LoadingBlock />
                ) : detail.error ? (
                  <div className="p-5">
                    <Alert onRetry={detail.reload}>{detail.error}</Alert>
                  </div>
                ) : items.length === 0 ? (
                  <EmptyState
                    title={selected.isDefault ? "Nothing saved yet" : `“${selected.name}” is empty`}
                    description="Tap the heart on any product, or use “Save to list…” to build a project list you can send to the cart in one go."
                    action={<LinkButton href="/shop/products" variant="outline">Browse products</LinkButton>}
                  />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {items.map((it) => (
                      <ItemRow
                        key={it.id}
                        item={it}
                        listId={selected.id}
                        onChange={(next) => detail.setData((prev) => (prev ? { ...prev, items: prev.items.map((x) => (x.id === next.id ? next : x)) } : prev))}
                        onRemove={(itemId) => {
                          detail.setData((prev) => (prev ? { ...prev, items: prev.items.filter((x) => x.id !== itemId) } : prev));
                          updateCount(selected.id, -1);
                        }}
                      />
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      <Modal
        open={creating}
        title="New list"
        onClose={() => setCreating(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={createList} loading={busy === "create"} disabled={!newName.trim()}>
              Create list
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void createList();
          }}
        >
          <Input name="list-name" label="List name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} placeholder="e.g. Villa project – phase 2" autoFocus />
          <p className="mt-2 text-xs text-slate-500">Up to 50 lists with 500 items each.</p>
        </form>
      </Modal>

      <Modal
        open={confirmDelete}
        title="Delete list"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteList} loading={busy === "delete"}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Delete <strong>{selected?.name}</strong> and its {selected?.itemCount ?? 0} saved {(selected?.itemCount ?? 0) === 1 ? "item" : "items"}? This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
