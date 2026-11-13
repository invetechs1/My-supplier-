/**
 * Launch-catalogue agent: puts the 200+ highest-demand Riyadh building products live with prices
 * and photos so the marketplace can open before third-party suppliers list.
 *
 *   pnpm --filter @mysupplier/api catalog:launch                 # seed products + prices, fetch photos, write report
 *   pnpm --filter @mysupplier/api catalog:launch -- --images-only  # only photos
 *   pnpm --filter @mysupplier/api catalog:launch -- --skip-images  # only products, prices, report
 *   pnpm --filter @mysupplier/api catalog:launch -- --force --sku CEM-OPC-50   # re-fetch one product's photo
 *   pnpm --filter @mysupplier/api catalog:launch -- --limit 20     # first 20 products without a photo
 *   pnpm --filter @mysupplier/api catalog:launch -- --images-only --reject TIL-POR-60,PPR-25   # drop wrong photos, pick others
 *
 * Steps
 *  1. Products + prices: ensures every product in prisma/seed-data/house-top200.ts exists and that
 *     MySupplier Direct has a fresh Riyadh listing (same code as `seed:house`).
 *  2. Photos: for each product without a photo, searches Openverse then Wikimedia Commons for a
 *     Creative-Commons photo (CC0 / CC BY / CC BY-SA / public domain), scores results against the
 *     product's search words, downloads the best one, resizes it to 800×800 WebP on white and saves it
 *     to assets/products/<sku>.webp (served at /catalog-images/<sku>.webp). The photo credit is stored
 *     on the product (imageAttribution) and shown under the gallery, as the licences require.
 *  3. Report: docs/CATALOG-LAUNCH-200.xlsx (every product, price, photo status, credit, review flag)
 *     and assets/products/credits.json.
 *
 * Network: api.openverse.org, commons.wikimedia.org, upload.wikimedia.org. Photos from these sources
 * are generic stock photos: review them in the workbook and replace with your own product photos over
 * time (Supplier → My products → Photos, or drop a file at assets/products/<sku>.webp and re-run with --force).
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import * as XLSX from "xlsx";
import { HOUSE_TOP200, type HouseProduct } from "../prisma/seed-data/house-top200";
import { seedHouse } from "../prisma/house-seed-lib";

const prisma = new PrismaClient();
const ROOT = path.resolve(__dirname, "..");
const ASSETS = process.env.CATALOG_IMAGES_DIR ?? path.join(ROOT, "assets/products");
const REPORT = path.resolve(ROOT, "../../docs/CATALOG-LAUNCH-200.xlsx");
const CREDITS = path.join(ASSETS, "credits.json");
const UA = "MySupplierCatalogAgent/1.0 (+https://mysupplier.sa; catalogue photo agent)";
const ALLOWED_LICENSES = new Set(["cc0", "by", "by-sa", "pdm"]);
const STOP = new Set(["and", "with", "for", "the", "per", "type", "roll", "box", "bag", "drum", "piece", "set", "kit", "mm", "inch", "heavy", "duty"]);
const BAD_WORDS = /\b(logo|map|diagram|drawing|icon|chart|screenshot|poster|flag|coat of arms|sign|plan|text|book|cover|stamp|coin|banknote|cartoon|clipart)\b/i;

interface Args { imagesOnly: boolean; skipImages: boolean; force: boolean; limit: number; sku: string | null; dryRun: boolean; reject: string[] }
function parseArgs(): Args {
  const a = process.argv.slice(2);
  const val = (flag: string) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : undefined; };
  return { imagesOnly: a.includes("--images-only"), skipImages: a.includes("--skip-images"), force: a.includes("--force"), limit: Number(val("--limit") ?? 0) || 0, sku: val("--sku") ?? null, dryRun: a.includes("--dry-run"), reject: (val("--reject") ?? "").split(",").map((x) => x.trim()).filter(Boolean) };
}

export interface Candidate { source: "openverse" | "commons"; id: string; title: string; tags: string[]; creator: string; license: string; licenseVersion: string; width: number; height: number; downloadUrl: string; landingUrl: string; sizeBytes?: number }
export interface Credit { sku: string; file: string; source: string; title: string; creator: string; license: string; url: string; fetchedAt: string; match: "exact" | "category" }

export const fileNameFor = (sku: string) => `${sku.replace(/[^A-Za-z0-9.-]+/g, "_")}.webp`;

/** Relevance of a result to the search words (title + tags must contain at least half of them). Pure. */
export function scoreCandidate(c: Candidate, query: string): number {
  const text = `${c.title} ${c.tags.join(" ")}`.toLowerCase();
  if (BAD_WORDS.test(c.title)) return -1;
  if (c.width < 400 || c.height < 300) return -1;
  const title = c.title.toLowerCase();
  // Code-like titles (camera file names, "IMG_1234", "2025-06-05_10-03") say nothing about the subject.
  if (!/[a-z]{3,}\s+[a-z]{3,}/.test(title) || /\d{4,}/.test(title.replace(/\s/g, "")) && title.replace(/[^a-z]/g, "").length < 12) return -1;
  const words = [...new Set(query.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)))];
  const stem = (w: string) => w.replace(/(es|s)$/, "");
  const hits = words.filter((w) => text.includes(stem(w))).length;
  const titleHits = words.filter((w) => title.includes(stem(w))).length;
  if (hits < words.length || titleHits < 1) return -1; // every word somewhere, at least one in the title
  const ratio = Math.min(c.width, c.height) / Math.max(c.width, c.height); // squarer is better for product cards
  const size = Math.min(1, Math.min(c.width, c.height) / 1200);
  return hits * 10 + ratio * 3 + size * 2 + (c.license === "cc0" || c.license === "pdm" ? 1 : 0);
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
let lastRequestAt = 0;
/** One request every ~2 s across both sources; retries 429 and 5xx with growing waits (Openverse and Commons both throttle). */
async function politeFetch(url: string, accept: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = Math.max(0, lastRequestAt + 2_000 - Date.now());
    if (wait) await sleep(wait);
    lastRequestAt = Date.now();
    try {
      const r = await fetch(url, { headers: { "user-agent": UA, accept }, signal: AbortSignal.timeout(25_000) });
      if (r.status === 429 || r.status >= 500) { await sleep((r.status === 429 ? 15_000 : 5_000) * (attempt + 1)); continue; }
      if (!r.ok) return null;
      return r;
    } catch { await sleep(3_000 * (attempt + 1)); }
  }
  return null;
}
async function getJson<T>(url: string): Promise<T | null> {
  const r = await politeFetch(url, "application/json");
  if (!r) return null;
  try { return (await r.json()) as T; } catch { return null; }
}

export async function searchOpenverse(query: string): Promise<Candidate[]> {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&license=cc0,by,by-sa,pdm&category=photograph&page_size=12&mature=false`;
  const json = await getJson<{ results?: Array<{ id: string; title?: string; creator?: string; license: string; license_version?: string; width?: number; height?: number; url: string; foreign_landing_url?: string; thumbnail?: string; tags?: Array<{ name: string }> }> }>(url);
  return (json?.results ?? []).map((r) => ({ source: "openverse" as const, id: r.id, title: r.title ?? "", tags: (r.tags ?? []).map((t) => t.name).slice(0, 40), creator: r.creator ?? "Unknown", license: r.license, licenseVersion: r.license_version ?? "", width: r.width ?? 0, height: r.height ?? 0, downloadUrl: r.thumbnail ?? `https://api.openverse.org/v1/images/${r.id}/thumbnail/`, landingUrl: r.foreign_landing_url ?? r.url }));
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
function commonsLicense(short: string): { code: string; version: string } | null {
  const s = short.toLowerCase();
  if (s === "cc0" || s.startsWith("cc0")) return { code: "cc0", version: "1.0" };
  if (s === "public domain" || s.includes("pd")) return { code: "pdm", version: "" };
  const m = s.match(/^cc by(-sa)? (\d\.\d)$/);
  if (m) return { code: m[1] ? "by-sa" : "by", version: m[2] };
  return null;
}
export async function searchCommons(query: string): Promise<Candidate[]> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}&gsrnamespace=6&gsrlimit=15&prop=imageinfo&iiprop=url|size|extmetadata&iiextmetadatafilter=LicenseShortName|Artist&format=json`;
  const json = await getJson<{ query?: { pages?: Record<string, { pageid: number; title: string; imageinfo?: Array<{ url: string; descriptionurl: string; width: number; height: number; size: number; extmetadata?: Record<string, { value: string }> }> }> } }>(url);
  const out: Candidate[] = [];
  for (const p of Object.values(json?.query?.pages ?? {})) {
    const ii = p.imageinfo?.[0];
    if (!ii || !/\.(jpe?g|png|webp)$/i.test(ii.url)) continue;
    const lic = commonsLicense(ii.extmetadata?.LicenseShortName?.value ?? "");
    if (!lic) continue;
    out.push({ source: "commons", id: String(p.pageid), title: p.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, ""), tags: [], creator: stripTags(ii.extmetadata?.Artist?.value ?? "Unknown").slice(0, 80), license: lic.code, licenseVersion: lic.version, width: ii.width, height: ii.height, downloadUrl: ii.url, landingUrl: ii.descriptionurl, sizeBytes: ii.size });
  }
  return out;
}

/** Generic photo per category, used when no photo matches the product's own search words (flagged for review). */
export const CATEGORY_QUERY: Record<string, string> = {
  "cement-concrete": "cement bags", "steel-rebar": "steel rebar", "blocks-bricks": "concrete blocks", "aggregates-sand": "gravel sand construction", "timber-formwork": "lumber planks",
  "gypsum-ceilings": "drywall gypsum", "insulation-waterproofing": "insulation construction", "chemicals-adhesives": "construction chemical bucket", "tiles-flooring": "ceramic tiles", "paints-coatings": "paint can",
  plumbing: "pvc pipes", "water-treatment-tanks": "water tank", "sanitary-ware": "bathroom sink", electrical: "electrical cable", lighting: "led lamp", hvac: "air conditioner", "hardware-fasteners": "screws bolts",
  "doors-windows": "door", "roofing-cladding": "roofing sheets", "landscaping-precast": "precast concrete", "scaffolding-access": "scaffolding", "safety-ppe": "safety helmet", "fire-safety": "fire extinguisher",
  "tools-equipment": "construction tools", "abrasives-consumables": "cutting disc", "generators-compressors-pumps": "generator", "concrete-compaction": "plate compactor", "site-facilities": "construction fence", "welding-fabrication": "welding",
};

async function bestFor(query: string, skip: string[] = []): Promise<Candidate | null> {
  const pools = [await searchOpenverse(query), await searchCommons(query)];
  const ranked = pools.flat().filter((c) => !skip.includes(`${c.source}:${c.title}`)).filter((c) => ALLOWED_LICENSES.has(c.license) && (c.sizeBytes === undefined || c.sizeBytes < 8_000_000)).map((c) => ({ c, s: scoreCandidate(c, query) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s);
  return ranked[0]?.c ?? null;
}

/** Best licensed photo: the product's own words, then the first two words, then the category's generic photo. */
export async function findPhoto(p: Pick<HouseProduct, "imageQuery" | "category">, skip: string[] = []): Promise<{ cand: Candidate; match: "exact" | "category" } | null> {
  const words = p.imageQuery.split(/\s+/);
  const exact = (await bestFor(p.imageQuery, skip)) ?? (words.length > 2 ? await bestFor(words.slice(0, 2).join(" "), skip) : null);
  if (exact) return { cand: exact, match: "exact" };
  const generic = CATEGORY_QUERY[p.category] ? await bestFor(CATEGORY_QUERY[p.category], skip) : null;
  return generic ? { cand: generic, match: "category" } : null;
}

async function download(url: string): Promise<Buffer | null> {
  const r = await politeFetch(url, "*/*"); // Openverse answers 406 to an image/* Accept header
  if (!r) return null;
  const ct = r.headers.get("content-type") ?? "";
  if (!ct.startsWith("image/")) return null;
  return Buffer.from(await r.arrayBuffer());
}

export async function toProductWebp(input: Buffer): Promise<Buffer> {
  return sharp(input).rotate().resize(800, 800, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } }).flatten({ background: "#ffffff" }).webp({ quality: 80 }).toBuffer();
}

export const licenseLabel = (c: Pick<Candidate, "license" | "licenseVersion">) => c.license === "cc0" ? "CC0 1.0" : c.license === "pdm" ? "Public domain" : `CC ${c.license.toUpperCase()} ${c.licenseVersion}`.trim();
export const creditText = (c: Candidate) => `Photo: ${c.creator} / ${licenseLabel(c)} · ${c.landingUrl}`;

function loadCredits(): Record<string, Credit> {
  try { return JSON.parse(fs.readFileSync(CREDITS, "utf8")) as Record<string, Credit>; } catch { return {}; }
}

const REJECTED = path.join(ASSETS, "rejected.json");
function loadRejected(): Record<string, string[]> { try { return JSON.parse(fs.readFileSync(REJECTED, "utf8")) as Record<string, string[]>; } catch { return {}; } }

/** `--reject SKU1,SKU2`: drop the chosen photo (file + DB) and remember the source id so the next run picks another. */
async function rejectPhotos(skus: string[]) {
  const credits = loadCredits(); const rejected = loadRejected();
  for (const sku of skus) {
    const c = credits[sku];
    if (c) { (rejected[sku] ??= []).push(`${c.source}:${c.title}`); fs.rmSync(path.join(ASSETS, c.file), { force: true }); delete credits[sku]; }
    await prisma.material.updateMany({ where: { sku, imageUrl: { startsWith: "/catalog-images/" } }, data: { imageUrl: null, imageAttribution: null } });
    console.log(`rejected ${sku}`);
  }
  fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2)); fs.writeFileSync(REJECTED, JSON.stringify(rejected, null, 2));
}

async function fetchPhotos(args: Args, products: HouseProduct[]) {
  fs.mkdirSync(ASSETS, { recursive: true });
  const credits = loadCredits(); const rejected = loadRejected();
  const materials = await prisma.material.findMany({ where: { sku: { in: products.map((p) => p.sku) } }, select: { id: true, sku: true, imageUrl: true } });
  const bySku = new Map(materials.map((m) => [m.sku, m]));
  let done = 0, fetched = 0, missing: string[] = [];
  for (const p of products) {
    if (args.sku && p.sku !== args.sku) continue;
    const m = bySku.get(p.sku);
    if (!m) continue;
    const file = fileNameFor(p.sku);
    const target = path.join(ASSETS, file);
    const hasOwnPhoto = m.imageUrl && !m.imageUrl.startsWith("/catalog-images/");
    if (hasOwnPhoto && !args.force) continue; // never overwrite a supplier-uploaded photo
    if (fs.existsSync(target) && !args.force) {
      if (m.imageUrl !== `/catalog-images/${file}`) await prisma.material.update({ where: { id: m.id }, data: { imageUrl: `/catalog-images/${file}`, imageAttribution: credits[p.sku] ? `Photo: ${credits[p.sku].creator} / ${credits[p.sku].license} · ${credits[p.sku].url}` : null } });
      continue;
    }
    if (args.limit && done >= args.limit) break;
    done++;
    process.stdout.write(`${p.sku.padEnd(16)} ${p.imageQuery.padEnd(40)} `);
    const found = await findPhoto(p, rejected[p.sku] ?? []);
    if (!found) { console.log("no licensed photo"); missing.push(p.sku); continue; }
    const { cand, match } = found;
    const raw = await download(cand.downloadUrl);
    if (!raw) { console.log(`download failed (${cand.source})`); missing.push(p.sku); continue; }
    let webp: Buffer;
    try { webp = await toProductWebp(raw); } catch (e) { console.log(`resize failed: ${(e as Error).message}`); missing.push(p.sku); continue; }
    if (args.dryRun) { console.log(`would save ${match} ${cand.source} "${cand.title.slice(0, 40)}" ${licenseLabel(cand)}`); continue; }
    fs.writeFileSync(target, webp);
    credits[p.sku] = { sku: p.sku, file, source: cand.source, title: cand.title, creator: cand.creator, license: licenseLabel(cand), url: cand.landingUrl, fetchedAt: new Date().toISOString(), match };
    await prisma.material.update({ where: { id: m.id }, data: { imageUrl: `/catalog-images/${file}`, imageAttribution: creditText(cand) } });
    fetched++;
    console.log(`✓ ${match === "category" ? "category photo" : cand.source} "${cand.title.slice(0, 40)}" ${licenseLabel(cand)} ${Math.round(webp.length / 1024)}KB`);
  }
  fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2));
  return { fetched, missing, credits };
}

async function writeReport(products: HouseProduct[], credits: Record<string, Credit>) {
  const materials = await prisma.material.findMany({ where: { sku: { in: products.map((p) => p.sku) } }, select: { sku: true, imageUrl: true, imageAttribution: true, category: { select: { name: true } } } });
  const bySku = new Map(materials.map((m) => [m.sku, m]));
  const rows = products.map((p, i) => {
    const m = bySku.get(p.sku);
    const credit = credits[p.sku];
    const photo = !m?.imageUrl ? "MISSING" : m.imageUrl.startsWith("/catalog-images/") ? (credit?.match === "category" ? "CATEGORY PHOTO (replace)" : "STOCK (review)") : "OWN";
    return {
      "#": i + 1, SKU: p.sku, Product: p.name, "Arabic name": p.nameAr, Category: m?.category.name ?? p.category, Unit: p.unit,
      "List price (SAR excl. VAT)": p.price, "Your cost (fill in)": "", "Margin %": "", "Min qty": p.minQty, "Lead time (days)": p.leadTimeDays, "Where to buy": p.source,
      Photo: photo, "Photo source": credit ? `${credit.source}: ${credit.title}` : "", "Photo credit / licence": m?.imageAttribution ?? "", "Replace with own photo?": photo === "STOCK (review)" ? "Review" : photo === "MISSING" ? "Yes – add photo" : photo.startsWith("CATEGORY") ? "Yes – generic category photo" : "",
      "Image search words": p.imageQuery,
    };
  });
  const wb = XLSX.utils.book_new();
  const readme = [
    ["MySupplier – Launch catalogue (227 products, Riyadh)"], [],
    ["What this is"], ["Every product MySupplier Direct sells in Phase 0 with its list price, where the ops team buys it, and the photo status. Generated by `pnpm --filter @mysupplier/api catalog:launch` on " + new Date().toISOString().slice(0, 10) + "."], [],
    ["How to use it"],
    ["1. Fill 'Your cost' from your distributor quotes; the Margin column shows the gap to the list price. Change prices in apps/api/prisma/seed-data/house-top200.ts (or in Supplier → My products as direct@mysupplier.sa) and re-run seed:house."],
    ["2. Photos marked STOCK (review) are Creative-Commons stock photos chosen automatically; open the product page, and replace any that do not look right with your own photo (Supplier → My products → Photos). The credit line under the gallery is required by the licence until you replace the photo."],
    ["3. Photos marked MISSING had no licensed photo available: upload your own."],
    ["4. Products are priced excl. VAT; VAT 15% is added at checkout. Delivery: 120 SAR per order in Riyadh, free above 3,000 SAR."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), "Read me");
  const ws = XLSX.utils.json_to_sheet(rows);
  // Margin formula per row: (price - cost) / price
  rows.forEach((_, i) => { const r = i + 2; ws[`I${r}`] = { t: "n", f: `IF(H${r}="","",(G${r}-H${r})/G${r})`, z: "0%" }; });
  ws["!cols"] = [{ wch: 4 }, { wch: 14 }, { wch: 44 }, { wch: 36 }, { wch: 24 }, { wch: 7 }, { wch: 12 }, { wch: 12 }, { wch: 9 }, { wch: 8 }, { wch: 9 }, { wch: 40 }, { wch: 14 }, { wch: 40 }, { wch: 60 }, { wch: 18 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws, "Launch 200");
  const byCat = new Map<string, { n: number; stock: number; own: number; missing: number }>();
  for (const r of rows) { const c = byCat.get(r.Category) ?? { n: 0, stock: 0, own: 0, missing: 0 }; c.n++; if (r.Photo === "OWN") c.own++; else if (r.Photo === "MISSING") c.missing++; else c.stock++; byCat.set(r.Category, c); }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([...byCat.entries()].map(([Category, c]) => ({ Category, Products: c.n, "Own photo": c.own, "Stock photo": c.stock, "No photo": c.missing }))), "By category");
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  XLSX.writeFile(wb, REPORT);
}

async function main() {
  const args = parseArgs();
  const products = HOUSE_TOP200;
  console.log(`Launch catalogue: ${products.length} products`);
  if (args.reject.length) { await rejectPhotos(args.reject); if (args.skipImages) return; }
  if (!args.imagesOnly) {
    const r = await seedHouse(prisma, products);
    console.log(`Products: ${r.materialsCreated} created · listings: ${r.listingsCreated} created, ${r.listingsUpdated} refreshed · valid until ${r.validUntil.toISOString().slice(0, 10)}`);
    if (r.password) console.log(`Ops login ${r.email} / generated password: ${r.password} (change it after first login)`);
  }
  let credits = loadCredits();
  if (!args.skipImages) {
    const r = await fetchPhotos(args, products);
    credits = r.credits;
    console.log(`Photos: ${r.fetched} fetched, ${r.missing.length} without a licensed photo${r.missing.length ? `: ${r.missing.join(", ")}` : ""}`);
  }
  if (!args.dryRun) { await writeReport(products, credits); console.log(`Report: ${REPORT}`); }
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
}
