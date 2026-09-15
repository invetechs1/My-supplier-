"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { Material, PriceListing, Product, Review, SupplierPublicProfile } from "@mysupplier/shared";
import { api, fileUrl } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatSar, timeAgo } from "@/lib/format";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, LoadingBlock, Pagination, Stars, StatTile, Table, VerificationBadge, type Column } from "@/components/ui";
import { ProductCard } from "@/components/shop/ProductCard";

/** Map one of the supplier's listings to a shop Product so we can reuse ProductCard. */
function listingToProduct(c: SupplierPublicProfile, l: PriceListing & { material: Material }): Product {
  const stock = (l as PriceListing & { stock?: number | null }).stock;
  return {
    ...l.material,
    bestOffer: {
      listingId: l.id,
      companyId: c.id,
      companyName: c.name,
      verified: c.verified,
      rating: c.rating,
      city: l.city,
      price: l.price,
      minQty: l.minQty,
      leadTimeDays: l.leadTimeDays,
      stock: typeof stock === "number" ? stock : null,
      source: l.source,
      sourceName: l.sourceName ?? null,
    },
    offerCount: 1,
    inStock: typeof stock === "number" ? stock > 0 : true,
    avgPrice: l.material.avgPrice ?? null,
  };
}

function ReviewItem({ r }: { r: Review }) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Stars value={r.rating} />
          <span className="text-sm font-medium text-slate-900">{r.buyer?.name}</span>
          {r.buyer?.company && <span className="text-xs text-slate-500">· {r.buyer.company.name}</span>}
        </div>
        <span className="text-xs text-slate-400" title={formatDate(r.createdAt)}>{timeAgo(r.createdAt)}</span>
      </div>
      {r.comment && <p className="mt-2 text-sm text-slate-700">{r.comment}</p>}
      {r.reply && (
        <div className="mt-3 rounded-xl border-s-4 border-brand-600 bg-brand-50 px-3 py-2 text-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Supplier reply</p>
          <p className="mt-0.5 text-slate-800">{r.reply}</p>
        </div>
      )}
    </li>
  );
}

export default function SupplierProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { lang } = useI18n();
  const state = useAsync(() => api.supplierProfile(id), [id]);
  const [reviewPage, setReviewPage] = useState(1);
  const companyId = state.data?.id ?? null;
  const reviews = useAsync(() => api.supplierReviews(companyId as string, reviewPage), [companyId, reviewPage], !!companyId && reviewPage > 1);
  const [view, setView] = useState<"grid" | "table">("grid");

  if (state.loading) return <LoadingBlock className="min-h-[50vh]" />;
  if (state.error || !state.data)
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Alert onRetry={state.reload}>{state.error ?? "Supplier not found"}</Alert>
      </div>
    );
  const c = state.data;
  const logo = fileUrl(c.logoUrl);
  const description = lang === "ar" ? c.descriptionAr || c.description : c.description || c.descriptionAr;
  const listings = (c.listings ?? []).filter((l) => l.material);
  const products = listings.map((l) => listingToProduct(c, l));
  const memberSince = c.stats?.memberSince ?? c.createdAt;
  const reviewRows = reviewPage > 1 ? reviews.data?.data ?? [] : c.reviews ?? [];
  const reviewTotal = reviews.data?.total ?? c.ratingCount ?? (c.reviews ?? []).length;
  const reviewPageSize = reviews.data?.pageSize ?? ((c.reviews ?? []).length || 10);

  const columns: Column<PriceListing & { material: Material }>[] = [
    { key: "material", header: "Material", render: (l) => (
      <Link href={`/shop/products/${l.material.id}`} className="font-medium text-slate-900 hover:text-brand-700">
        {lang === "ar" ? l.material.nameAr || l.material.name : l.material.name}
        <span className="ms-2 text-xs font-normal text-slate-400">{l.material.sku}</span>
      </Link>
    ) },
    { key: "city", header: "City", render: (l) => l.city },
    { key: "price", header: "Price", align: "end", render: (l) => <span className="font-semibold tabular-nums">{formatSar(l.price, lang)}<span className="text-xs font-normal text-slate-400"> / {l.material.unit}</span></span> },
    { key: "minQty", header: "Min qty", align: "end", render: (l) => l.minQty },
    { key: "lead", header: "Lead time", align: "end", render: (l) => `${l.leadTimeDays} d` },
    { key: "updated", header: "Updated", render: (l) => <span className="text-slate-500">{timeAgo(l.updatedAt)}</span> },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/suppliers" className="hover:text-brand-700">Suppliers</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">{c.name}</span>
      </nav>

      <Card className="overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500" />
        <div className="px-6 pb-6">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={`${c.name} logo`} className="h-24 w-24 rounded-2xl border-4 border-white bg-white object-contain shadow-card" />
              ) : (
                <span className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-white bg-brand-600 text-2xl font-semibold text-white shadow-card">{c.name.slice(0, 2).toUpperCase()}</span>
              )}
              <div className="pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold text-slate-900">{lang === "ar" ? c.nameAr || c.name : c.name}</h1>
                  <VerificationBadge status={c.verificationStatus ?? (c.verified ? "VERIFIED" : "PENDING")} />
                </div>
                {(lang === "ar" ? c.name : c.nameAr) && <p className="text-slate-500">{lang === "ar" ? c.name : c.nameAr}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  <Stars value={c.rating} count={c.ratingCount} />
                  <span>·</span>
                  <span>{c.city}{c.region ? `, ${c.region}` : ""}</span>
                  <span>·</span>
                  <span>Member since {formatDate(memberSince, lang)}</span>
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              {c.phone && (<><dt className="text-slate-500">Phone</dt><dd className="font-medium text-slate-900" dir="ltr">{c.phone}</dd></>)}
              {c.email && (<><dt className="text-slate-500">Email</dt><dd><a href={`mailto:${c.email}`} className="font-medium text-brand-700 hover:underline" dir="ltr">{c.email}</a></dd></>)}
              {c.website && (<><dt className="text-slate-500">Website</dt><dd><a href={c.website} target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:underline" dir="ltr">{c.website.replace(/^https?:\/\//, "")}</a></dd></>)}
              {c.workingHours && (<><dt className="text-slate-500">Hours</dt><dd className="font-medium text-slate-900">{c.workingHours}</dd></>)}
              {c.crNumber && (<><dt className="text-slate-500">CR</dt><dd className="font-medium text-slate-900" dir="ltr">{c.crNumber}</dd></>)}
              {c.vatNumber && (<><dt className="text-slate-500">VAT</dt><dd className="font-medium text-slate-900" dir="ltr">{c.vatNumber}</dd></>)}
            </dl>
          </div>

          <div className="mt-5 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {description ? <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{description}</p> : <p className="text-sm italic text-slate-400">This supplier has not added a description yet.</p>}
              {(c.citiesServed ?? []).length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Delivers to</p>
                  <div className="flex flex-wrap gap-1.5">{c.citiesServed.map((city) => <Badge key={city} tone="slate">{city}</Badge>)}</div>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery terms</p>
              <dl className="space-y-1.5">
                <div className="flex justify-between"><dt className="text-slate-500">Minimum order</dt><dd className="font-medium text-slate-900">{c.minOrderValue ? formatSar(c.minOrderValue, lang) : "None"}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Delivery fee</dt><dd className="font-medium text-slate-900">{c.deliveryFee === 0 ? "Free" : c.deliveryFee ? formatSar(c.deliveryFee, lang) : "Quoted per order"}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Delivery time</dt><dd className="font-medium text-slate-900">{c.deliveryDays !== null && c.deliveryDays !== undefined ? `${c.deliveryDays} day${c.deliveryDays === 1 ? "" : "s"}` : "Per listing"}</dd></div>
              </dl>
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Products" value={c.stats?.listings ?? listings.length} />
        <StatTile label="Orders delivered" value={c.stats?.ordersDelivered ?? 0} tone="brand" />
        <StatTile label="Bids submitted" value={c.stats?.bids ?? 0} />
        <StatTile label="Bids won" value={c.stats?.wonBids ?? 0} />
      </div>

      {(c.branches ?? []).length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Branches & pick-up points" />
          <CardBody>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {c.branches.map((b) => (
                <li key={b.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <p className="font-medium text-slate-900">{b.name}{b.isDefault && <Badge tone="green" className="ms-2">Main</Badge>}</p>
                  <p className="text-slate-600">{b.city}{b.address ? ` · ${b.address}` : ""}</p>
                  {b.phone && <p className="text-slate-500" dir="ltr">{b.phone}</p>}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader
          title="Products & prices"
          subtitle={`${listings.length} published listing${listings.length === 1 ? "" : "s"}`}
          action={
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
              <button type="button" onClick={() => setView("grid")} className={view === "grid" ? "rounded-md bg-white px-2.5 py-1 text-brand-700 shadow-sm" : "px-2.5 py-1 text-slate-600"}>Grid</button>
              <button type="button" onClick={() => setView("table")} className={view === "table" ? "rounded-md bg-white px-2.5 py-1 text-brand-700 shadow-sm" : "px-2.5 py-1 text-slate-600"}>Table</button>
            </div>
          }
        />
        {listings.length === 0 ? (
          <EmptyState title="No published prices" />
        ) : view === "grid" ? (
          <CardBody>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {products.map((p, i) => <ProductCard key={listings[i].id} product={p} />)}
            </div>
          </CardBody>
        ) : (
          <Table columns={columns} rows={listings} rowKey={(l) => l.id} />
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Reviews" subtitle={c.ratingCount ? `${c.rating.toFixed(1)} average from ${c.ratingCount} verified orders` : "No reviews yet"} />
        {reviews.loading ? <LoadingBlock /> : reviews.error ? <div className="p-5"><Alert onRetry={reviews.reload}>{reviews.error}</Alert></div> : reviewRows.length === 0 ? (
          <EmptyState title="No reviews yet" description="Buyers can leave a review after an order is delivered." />
        ) : (
          <ul className="divide-y divide-slate-100">{reviewRows.map((r) => <ReviewItem key={r.id} r={r} />)}</ul>
        )}
        <Pagination page={reviewPage} pageSize={reviewPageSize} total={reviewTotal} onChange={setReviewPage} />
      </Card>
    </div>
  );
}
