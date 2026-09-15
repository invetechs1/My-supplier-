"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SAUDI_CITIES, UNITS, type PriceUpdateSubmission, type SupplierCatalogItem } from "@mysupplier/shared";
import { api, errorMessage, type PriceUpdateResult } from "@/lib/api";
import { useAsync, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate, formatSar, timeAgo } from "@/lib/format";
import { Alert, Button, Card, CardBody, CardHeader, Input, LinkButton, LoadingBlock, VerifiedBadge } from "@/components/ui";

interface Draft {
  price: string;
  stock: string;
  leadTimeDays: string;
}

interface NewRow {
  key: number;
  name: string;
  categorySlug: string;
  unit: string;
  price: string;
  city: string;
  stock: string;
}

const control = "block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20";

export default function UpdatePricesPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";
  const { lang } = useI18n();
  const state = useAsync(() => api.priceUpdateInfo(token), [token], !!token);
  const categories = useAsync(() => api.categories(), []);
  const info = state.data;
  usePageTitle(info ? `Update prices · ${info.company.name}` : "Update your prices");

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newRows, setNewRows] = useState<NewRow[]>([]);
  const [contactName, setContactName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<PriceUpdateResult | null>(null);
  const [nextKey, setNextKey] = useState(1);

  useEffect(() => {
    if (!info) return;
    const next: Record<string, Draft> = {};
    info.listings.forEach((l) => {
      const stock = (l as { stock?: number | null }).stock;
      next[l.id] = { price: String(l.price), stock: stock === null || stock === undefined ? "" : String(stock), leadTimeDays: String(l.leadTimeDays ?? 0) };
    });
    setDrafts(next);
  }, [info]);

  const expired = useMemo(() => !!info && new Date(info.expiresAt).getTime() < Date.now(), [info]);
  const completed = !!info?.completedAt;

  const addRow = () => {
    setNewRows((rows) => [...rows, { key: nextKey, name: "", categorySlug: "", unit: "piece", price: "", city: info?.company.city ?? "Riyadh", stock: "" }]);
    setNextKey((k) => k + 1);
  };
  const updateRow = (key: number, patch: Partial<NewRow>) => setNewRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: number) => setNewRows((rows) => rows.filter((r) => r.key !== key));

  const changedCount = info ? info.listings.filter((l) => {
    const d = drafts[l.id];
    if (!d) return false;
    const stock = (l as { stock?: number | null }).stock;
    return Number(d.price) !== l.price || d.stock !== (stock === null || stock === undefined ? "" : String(stock)) || Number(d.leadTimeDays) !== (l.leadTimeDays ?? 0);
  }).length : 0;

  const submit = async () => {
    if (!info) return;
    setError(null);
    const items: PriceUpdateSubmission["items"] = [];
    for (const l of info.listings) {
      const d = drafts[l.id];
      if (!d) continue;
      const price = Number(d.price);
      if (!d.price.trim() || !Number.isFinite(price) || price <= 0) {
        setError(`Enter a valid price for ${l.material?.name ?? "every item"}.`);
        return;
      }
      const stock = d.stock.trim() === "" ? null : Math.max(0, Math.floor(Number(d.stock)));
      const lead = Number(d.leadTimeDays);
      items.push({ listingId: l.id, price, stock: stock !== null && Number.isNaN(stock) ? null : stock, leadTimeDays: Number.isFinite(lead) && lead >= 0 ? lead : undefined });
    }
    const newItems: SupplierCatalogItem[] = [];
    for (const r of newRows) {
      if (!r.name.trim() && !r.price.trim()) continue; // blank row, ignore
      const price = Number(r.price);
      if (!r.name.trim() || !r.categorySlug || !r.unit || !r.city || !Number.isFinite(price) || price <= 0) {
        setError("Each new item needs a name, category, unit, city and a positive price.");
        return;
      }
      newItems.push({
        name: r.name.trim(),
        categorySlug: r.categorySlug,
        unit: r.unit,
        price,
        city: r.city,
        stock: r.stock.trim() === "" ? undefined : Math.max(0, Math.floor(Number(r.stock))),
      });
    }
    setSubmitting(true);
    try {
      const res = await api.submitPriceUpdate(token, { items, newItems: newItems.length ? newItems : undefined, contactName: contactName.trim() || undefined });
      setDone(res);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(errorMessage(err, "Could not save your prices."));
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children: React.ReactNode) => <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">{children}</div>;

  if (!token || (state.error && !info)) {
    return shell(
      <Card>
        <CardBody className="py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </span>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">This link is invalid or has expired</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Price-update links are valid for 14 days and can only be used by the supplier they were sent to. {state.error ? <span className="text-slate-500">({state.error})</span> : null}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <LinkButton href="/login">Log in to update prices</LinkButton>
            <LinkButton href="/contact" variant="outline">Ask for a new link</LinkButton>
          </div>
        </CardBody>
      </Card>,
    );
  }

  if (state.loading || !info) return shell(<LoadingBlock label="Loading your price list…" />);

  if (done) {
    return shell(
      <Card>
        <CardBody className="py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </span>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">Thank you — your prices are live</h1>
          <p className="mt-2 text-sm text-slate-600">
            {done.updated} price{done.updated === 1 ? "" : "s"} updated{done.added ? ` and ${done.added} new item${done.added === 1 ? "" : "s"} added` : ""} for {info.company.name}. Buyers across Saudi Arabia can see them now.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <LinkButton href={`/suppliers/${info.company.id}`} variant="outline">View your public profile</LinkButton>
            <LinkButton href="/login">Log in for the full dashboard</LinkButton>
          </div>
        </CardBody>
      </Card>,
    );
  }

  if (completed || expired) {
    return shell(
      <Card>
        <CardBody className="py-14 text-center">
          <h1 className="text-xl font-semibold text-slate-900">{completed ? "Already updated" : "This link has expired"}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            {completed
              ? `Prices for ${info.company.name} were updated ${timeAgo(info.completedAt)} using this link. Each link can be used once.`
              : `This link expired on ${formatDate(info.expiresAt, lang)}. Ask the MySupplier team for a fresh one, or log in to edit prices any time.`}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <LinkButton href="/login">Log in</LinkButton>
            <LinkButton href="/contact" variant="outline">Contact us</LinkButton>
          </div>
        </CardBody>
      </Card>,
    );
  }

  const categoryOptions = (categories.data ?? []).map((c) => ({ value: c.slug, label: c.name }));

  return shell(
    <div className="space-y-6">
      <div className="rounded-2xl bg-brand-700 px-6 py-8 text-white shadow-card">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-100">MySupplier · Build for less</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold sm:text-3xl">{info.company.name}</h1>
          {info.company.verified && <VerifiedBadge verified />}
        </div>
        {info.company.nameAr && <p className="mt-1 text-brand-100" dir="rtl">{info.company.nameAr}</p>}
        <p className="mt-3 text-lg text-brand-50">Update your prices on MySupplier — takes 2 minutes</p>
        <p className="mt-1 text-sm text-brand-100">
          Your current prices are pre-filled. Change what moved, add anything new, hit save. No login needed · link valid until {formatDate(info.expiresAt, lang)}.
        </p>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <Card>
        <CardHeader title="Your listings" subtitle={`${info.listings.length} item${info.listings.length === 1 ? "" : "s"} · ${changedCount} changed`} />
        {info.listings.length === 0 ? (
          <CardBody>
            <p className="text-sm text-slate-600">No listings yet — add your items below.</p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-start">Material</th>
                  <th className="px-4 py-3 text-start">Unit</th>
                  <th className="px-4 py-3 text-start">City</th>
                  <th className="px-4 py-3 text-end">Current</th>
                  <th className="px-4 py-3 text-start">New price (SAR)</th>
                  <th className="px-4 py-3 text-start">Stock</th>
                  <th className="px-4 py-3 text-start">Lead time (days)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {info.listings.map((l) => {
                  const d = drafts[l.id] ?? { price: String(l.price), stock: "", leadTimeDays: String(l.leadTimeDays ?? 0) };
                  const changed = Number(d.price) !== l.price;
                  return (
                    <tr key={l.id} className={cn(changed && "bg-amber-50/40")}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{l.material?.name}</p>
                        <p className="text-xs text-slate-500" dir="rtl">{l.material?.nameAr}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{l.material?.unit}</td>
                      <td className="px-4 py-3 text-slate-600">{l.city}</td>
                      <td className="px-4 py-3 text-end tabular-nums text-slate-500" title={`Updated ${timeAgo(l.updatedAt)}`}>
                        {formatSar(l.price, lang)}
                      </td>
                      <td className="px-4 py-3">
                        <input type="number" min={0} step="0.01" value={d.price} onChange={(e) => setDrafts({ ...drafts, [l.id]: { ...d, price: e.target.value } })} dir="ltr" aria-label={`New price for ${l.material?.name}`} className={cn(control, "w-28 text-end tabular-nums", changed && "border-amber-400")} />
                      </td>
                      <td className="px-4 py-3">
                        <input type="number" min={0} value={d.stock} onChange={(e) => setDrafts({ ...drafts, [l.id]: { ...d, stock: e.target.value } })} dir="ltr" placeholder="on request" aria-label="Stock" className={cn(control, "w-24 text-end tabular-nums")} />
                      </td>
                      <td className="px-4 py-3">
                        <input type="number" min={0} value={d.leadTimeDays} onChange={(e) => setDrafts({ ...drafts, [l.id]: { ...d, leadTimeDays: e.target.value } })} dir="ltr" aria-label="Lead time in days" className={cn(control, "w-20 text-end tabular-nums")} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Add new items"
          subtitle="Anything you sell that is not listed above."
          action={
            <Button size="sm" variant="secondary" onClick={addRow}>
              + Add new item
            </Button>
          }
        />
        {newRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-start">Name</th>
                  <th className="px-4 py-3 text-start">Category</th>
                  <th className="px-4 py-3 text-start">Unit</th>
                  <th className="px-4 py-3 text-start">Price (SAR)</th>
                  <th className="px-4 py-3 text-start">City</th>
                  <th className="px-4 py-3 text-start">Stock</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {newRows.map((r) => (
                  <tr key={r.key}>
                    <td className="px-4 py-2">
                      <input value={r.name} onChange={(e) => updateRow(r.key, { name: e.target.value })} placeholder="e.g. Hollow block 20cm" aria-label="Item name" className={cn(control, "min-w-[180px]")} />
                    </td>
                    <td className="px-4 py-2">
                      <select value={r.categorySlug} onChange={(e) => updateRow(r.key, { categorySlug: e.target.value })} aria-label="Category" className={cn(control, "min-w-[140px] pe-7")}>
                        <option value="">{categories.loading ? "Loading…" : "Select…"}</option>
                        {categoryOptions.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select value={r.unit} onChange={(e) => updateRow(r.key, { unit: e.target.value })} aria-label="Unit" className={cn(control, "w-24 pe-7")}>
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input type="number" min={0} step="0.01" value={r.price} onChange={(e) => updateRow(r.key, { price: e.target.value })} dir="ltr" aria-label="Price" className={cn(control, "w-28 text-end tabular-nums")} />
                    </td>
                    <td className="px-4 py-2">
                      <select value={r.city} onChange={(e) => updateRow(r.key, { city: e.target.value })} aria-label="City" className={cn(control, "w-32 pe-7")}>
                        {SAUDI_CITIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input type="number" min={0} value={r.stock} onChange={(e) => updateRow(r.key, { stock: e.target.value })} dir="ltr" placeholder="—" aria-label="Stock" className={cn(control, "w-20 text-end tabular-nums")} />
                    </td>
                    <td className="px-4 py-2 text-end">
                      <button type="button" onClick={() => removeRow(r.key)} className="text-xs text-red-600 hover:underline">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {newRows.length === 0 && (
          <CardBody>
            <p className="text-sm text-slate-500">No new items yet.</p>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-4">
          <Input label="Your name (optional)" name="contactName" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="So we know who updated the prices" className="w-full sm:max-w-xs" />
          <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
            <span className="text-xs text-slate-500">
              {changedCount} price{changedCount === 1 ? "" : "s"} changed · {newRows.length} new item{newRows.length === 1 ? "" : "s"}
            </span>
            <Button size="lg" variant="accent" onClick={submit} loading={submitting} disabled={info.listings.length === 0 && newRows.length === 0}>
              Save my prices
            </Button>
          </div>
        </CardBody>
      </Card>

      <p className="text-center text-xs text-slate-500">
        Prices exclude VAT. By saving you confirm these are your current selling prices. Questions? <Link href="/contact" className="font-semibold text-brand-700 hover:underline">Contact us</Link>.
      </p>
    </div>,
  );
}
