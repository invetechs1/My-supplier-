/**
 * Launch-catalogue agent: puts the 200+ highest-demand Riyadh building products live with prices
 * and photos so the marketplace can open before third-party suppliers list.
 *
 *   pnpm --filter @mysupplier/api catalog:launch                      # seed products + prices, fetch photos, write report
 *   pnpm --filter @mysupplier/api catalog:launch -- --images-only     # only photos
 *   pnpm --filter @mysupplier/api catalog:launch -- --skip-images     # only products, prices, report
 *   pnpm --filter @mysupplier/api catalog:launch -- --images-only --reject rebar,pavers   # drop a family's photo, pick the next candidate
 *   pnpm --filter @mysupplier/api catalog:launch -- --images-only --force --group rebar   # re-fetch one family
 *   pnpm --filter @mysupplier/api catalog:launch -- --dry-run         # show choices without saving
 *
 * Steps
 *  1. Products + prices: ensures every product in prisma/seed-data/house-top200.ts exists and that
 *     MySupplier Direct has a fresh Riyadh listing (same code as `seed:house`).
 *  2. Photos: products are grouped into photo families (scripts/catalog-photo-groups.ts: all rebar
 *     sizes share one rebar photo, as any store does). For each family the agent lists curated
 *     Wikimedia Commons categories, keeps Creative-Commons / public-domain photos (CC0, CC BY,
 *     CC BY-SA, PD), ranks them (size, shape, no drawings/maps/scenes), falls back to a Commons
 *     search, then downloads the best one, resizes it to 800×800 WebP on white and writes
 *     assets/products/<sku>.webp for every product in the family (served at /catalog-images/<sku>.webp).
 *     The photo credit is stored on the product (imageAttribution) and shown under the gallery, as
 *     the licences require. Review the photos (docs/CATALOG-LAUNCH-200.xlsx lists every one);
 *     `--reject family` drops a wrong photo and the next run picks the next candidate.
 *  3. Report: docs/CATALOG-LAUNCH-200.xlsx (every product, price, photo status, credit, review flag)
 *     and assets/products/credits.json.
 *
 * Network: commons.wikimedia.org and upload.wikimedia.org only. Replace stock photos with your own
 * product photos over time (Supplier → My products → Photos, or drop a file at
 * assets/products/<sku>.webp and re-run with --force).
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import * as XLSX from "xlsx";
import { HOUSE_TOP200, type HouseProduct } from "../prisma/seed-data/house-top200";
import { seedHouse } from "../prisma/house-seed-lib";
import { PHOTO_GROUPS, photoGroupFor } from "./catalog-photo-groups";

const prisma = new PrismaClient();
const ROOT = path.resolve(__dirname, "..");
const ASSETS = process.env.CATALOG_IMAGES_DIR ?? path.join(ROOT, "assets/products");
const REPORT = path.resolve(ROOT, "../../docs/CATALOG-LAUNCH-200.xlsx");
const CREDITS = path.join(ASSETS, "credits.json");
const REJECTED = path.join(ASSETS, "rejected.json");
const UA = "MySupplierCatalogAgent/1.0 (+https://mysupplier.sa; catalogue photo agent)";
const BAD_WORDS = /\b(defense\.gov|navy|army|military|soldier|soldiers|marines|vehicle|car|van|truck|office|company|news|interior|room|bedroom|kitchen|garden|park|forest|beach|logo|map|diagram|drawing|icon|chart|screenshot|poster|flag|coat of arms|plan|book|cover|stamp|coin|banknote|cartoon|clipart|sketch|scheme|schema|graph|table|label|museum|statue|sculpture|painting|art|antique|historic|ruin|church|temple|castle|bridge|dam|railway|train|station|street|road|people|man|woman|worker|workers|crowd|ceremony|exhibition|fair|shop|store|factory|plant|mill|quarry|mine|site|building|house|tower|skyline|aerial|view|panorama|landscape)\b/i;

interface Args { imagesOnly: boolean; skipImages: boolean; force: boolean; limit: number; group: string | null; dryRun: boolean; reject: string[] }
function parseArgs(): Args {
  const a = process.argv.slice(2);
  const val = (flag: string) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : undefined; };
  return { imagesOnly: a.includes("--images-only"), skipImages: a.includes("--skip-images"), force: a.includes("--force"), limit: Number(val("--limit") ?? 0) || 0, group: val("--group") ?? null, dryRun: a.includes("--dry-run"), reject: (val("--reject") ?? "").split(",").map((x) => x.trim()).filter(Boolean) };
}

export interface Candidate { id: string; title: string; creator: string; license: string; width: number; height: number; downloadUrl: string; landingUrl: string; sizeBytes: number; via: string }
export interface Credit { group: string; file: string; title: string; creator: string; license: string; url: string; via: string; fetchedAt: string }

export const fileNameFor = (sku: string) => `${sku.replace(/[^A-Za-z0-9.-]+/g, "_")}.webp`;
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

let lastRequestAt = 0;
/** One request per ~1.2 s; retries 429 and 5xx with growing waits (Commons throttles anonymous clients). */
async function politeFetch(url: string, accept: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = Math.max(0, lastRequestAt + 1_200 - Date.now());
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
export async function getJson<T>(url: string): Promise<T | null> {
  const r = await politeFetch(url, "application/json");
  if (!r) return null;
  try { return (await r.json()) as T; } catch { return null; }
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
/** Accept only licences that allow commercial use with attribution (or none). */
export function licenseOk(short: string): string | null {
  const s = short.trim();
  if (/^cc0/i.test(s)) return "CC0 1.0";
  if (/^public domain$/i.test(s) || /^pd/i.test(s)) return "Public domain";
  const m = s.match(/^CC BY(-SA)? (\d\.\d)$/i);
  if (m) return `CC BY${m[1] ? "-SA" : ""} ${m[2]}`;
  return null;
}

type Page = { pageid: number; title: string; imageinfo?: Array<{ url: string; descriptionurl: string; width: number; height: number; size: number; extmetadata?: Record<string, { value: string }> }> };
function toCandidates(pages: Record<string, Page> | undefined, via: string): Candidate[] {
  const out: Candidate[] = [];
  for (const p of Object.values(pages ?? {})) {
    const ii = p.imageinfo?.[0];
    if (!ii || !/\.(jpe?g|png|webp)(\?.*)?$/i.test(ii.url)) continue; // file URLs carry a utm query string
    const license = licenseOk(ii.extmetadata?.LicenseShortName?.value ?? "");
    if (!license) continue;
    out.push({ id: String(p.pageid), title: p.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, ""), creator: stripTags(ii.extmetadata?.Artist?.value ?? "Unknown").slice(0, 80) || "Unknown", license, width: ii.width, height: ii.height, downloadUrl: ii.url, landingUrl: ii.descriptionurl, sizeBytes: ii.size, via });
  }
  return out;
}
const II = "prop=imageinfo&iiprop=url|size|extmetadata&iiextmetadatafilter=LicenseShortName|Artist&format=json";
export async function listCategory(category: string): Promise<Candidate[]> {
  const json = await getJson<{ query?: { pages?: Record<string, Page> } }>(`https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle=${encodeURIComponent(`Category:${category}`)}&gcmtype=file&gcmlimit=50&${II}`);
  return toCandidates(json?.query?.pages, `Category:${category}`);
}
export async function searchCommons(query: string): Promise<Candidate[]> {
  const json = await getJson<{ query?: { pages?: Record<string, Page> } }>(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}&gsrnamespace=6&gsrlimit=25&${II}`);
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  // A search hit must carry at least half of the words in its file name.
  return toCandidates(json?.query?.pages, `search:${query}`).filter((c) => words.filter((w) => c.title.toLowerCase().includes(w.replace(/s$/, ""))).length >= Math.ceil(words.length / 2));
}

/** Product-photo quality heuristics: usable size, not a drawing/map/scene, moderately square, named after the product. Pure. */
export function scoreCandidate(c: Candidate, words: string[] = []): number {
  if (BAD_WORDS.test(c.title)) return -1;
  if (Math.min(c.width, c.height) < 500 || c.sizeBytes > 12_000_000) return -1;
  if (/\.(svg|gif|tiff?)(\?.*)?$/i.test(c.downloadUrl)) return -1;
  const title = c.title.toLowerCase();
  const ratio = Math.min(c.width, c.height) / Math.max(c.width, c.height);
  const size = Math.min(1, Math.min(c.width, c.height) / 1500);
  const named = words.filter((w) => title.includes(w.replace(/s$/, ""))).length; // "plywood sheets" in the file name beats "DSC_0042"
  const codeLike = /\d{5,}/.test(title.replace(/[\s_-]/g, "")) || !/[a-z]{4,}/.test(title) ? 2 : 0;
  return named * 3 + ratio * 4 + size * 2 - codeLike + (c.license === "CC0 1.0" || c.license === "Public domain" ? 0.5 : 0);
}

/** Ranked candidates for a family: curated categories first (in order), then the search fallback. */
export async function candidatesFor(group: string): Promise<Candidate[]> {
  const def = PHOTO_GROUPS[group];
  const seen = new Set<string>();
  const out: Array<{ c: Candidate; s: number; order: number }> = [];
  let order = 0;
  const words = def.search.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const add = (list: Candidate[]) => { order++; for (const c of list) { if (seen.has(c.id)) continue; seen.add(c.id); const s = scoreCandidate(c, words); if (s >= 0) out.push({ c, s, order }); } };
  for (const cat of def.categories) { add(await listCategory(cat)); if (out.length >= 6) break; }
  if (out.length < 3) add(await searchCommons(def.search));
  // Curated categories beat search; within one source the best-scoring photo first.
  return out.sort((a, b) => a.order - b.order || b.s - a.s).map((x) => x.c);
}

async function download(url: string): Promise<Buffer | null> {
  const r = await politeFetch(url, "*/*");
  if (!r) return null;
  const ct = r.headers.get("content-type") ?? "";
  if (!ct.startsWith("image/")) return null;
  return Buffer.from(await r.arrayBuffer());
}
export async function toProductWebp(input: Buffer): Promise<Buffer> {
  return sharp(input).rotate().resize(800, 800, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } }).flatten({ background: "#ffffff" }).webp({ quality: 80 }).toBuffer();
}
export const creditText = (c: Pick<Candidate, "creator" | "license" | "landingUrl">) => `Photo: ${c.creator} / ${c.license} · ${c.landingUrl}`;

const readJson = <T,>(file: string, fallback: T): T => { try { return JSON.parse(fs.readFileSync(file, "utf8")) as T; } catch { return fallback; } };
const loadCredits = () => readJson<Record<string, Credit>>(CREDITS, {});
const loadRejected = () => readJson<Record<string, string[]>>(REJECTED, {});

/** `--reject rebar,pavers`: drop the family's photo (files + DB) and remember the candidate so the next run skips it. */
async function rejectGroups(groups: string[], products: HouseProduct[]) {
  const credits = loadCredits(); const rejected = loadRejected();
  for (const g of groups) {
    const skus = products.filter((p) => photoGroupFor(p.sku) === g).map((p) => p.sku);
    const c = credits[skus[0] ?? ""];
    if (c) (rejected[g] ??= []).push(c.title);
    for (const sku of skus) { fs.rmSync(path.join(ASSETS, fileNameFor(sku)), { force: true }); delete credits[sku]; }
    await prisma.material.updateMany({ where: { sku: { in: skus }, imageUrl: { startsWith: "/catalog-images/" } }, data: { imageUrl: null, imageAttribution: null } });
    console.log(`rejected ${g} (${skus.length} products)`);
  }
  fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2)); fs.writeFileSync(REJECTED, JSON.stringify(rejected, null, 2));
}

async function fetchPhotos(args: Args, products: HouseProduct[]) {
  fs.mkdirSync(ASSETS, { recursive: true });
  const credits = loadCredits(); const rejected = loadRejected();
  const materials = await prisma.material.findMany({ where: { sku: { in: products.map((p) => p.sku) } }, select: { id: true, sku: true, imageUrl: true } });
  const bySku = new Map(materials.map((m) => [m.sku, m]));
  const families = new Map<string, HouseProduct[]>();
  for (const p of products) { const g = photoGroupFor(p.sku); if (g) (families.get(g) ?? families.set(g, []).get(g)!).push(p); }
  let done = 0, fetched = 0; const missing: string[] = [];
  for (const [group, members] of families) {
    if (args.group && group !== args.group) continue;
    // Products with a supplier-uploaded photo are never overwritten; members already done are skipped.
    const todo = members.filter((p) => { const m = bySku.get(p.sku); if (!m) return false; const own = m.imageUrl && !m.imageUrl.startsWith("/catalog-images/"); return args.force ? !own : !own && !fs.existsSync(path.join(ASSETS, fileNameFor(p.sku))); });
    if (!todo.length) continue;
    // Reuse the family photo if another member already has it.
    const existing = members.map((p) => credits[p.sku]).find(Boolean);
    let webp: Buffer | null = null; let credit: Credit | null = null;
    if (existing && !args.force && fs.existsSync(path.join(ASSETS, existing.file))) { webp = fs.readFileSync(path.join(ASSETS, existing.file)); credit = existing; }
    else {
      if (args.limit && done >= args.limit) break;
      done++;
      process.stdout.write(`${group.padEnd(20)} ${String(members.length).padStart(2)} products  `);
      const skip = new Set(rejected[group] ?? []);
      const cands = (await candidatesFor(group)).filter((c) => !skip.has(c.title));
      for (const cand of cands.slice(0, 4)) {
        const raw = await download(cand.downloadUrl);
        if (!raw) continue;
        try { webp = await toProductWebp(raw); } catch { continue; }
        credit = { group, file: "", title: cand.title, creator: cand.creator, license: cand.license, url: cand.landingUrl, via: cand.via, fetchedAt: new Date().toISOString() };
        break;
      }
      if (!webp || !credit) { console.log("no usable photo"); missing.push(group); continue; }
      console.log(`${args.dryRun ? "would use" : "✓"} "${credit.title.slice(0, 48)}" ${credit.license} via ${credit.via}`);
      if (args.dryRun) continue;
      fetched++;
    }
    for (const p of todo) {
      const file = fileNameFor(p.sku);
      fs.writeFileSync(path.join(ASSETS, file), webp);
      credits[p.sku] = { ...credit, file };
      await prisma.material.update({ where: { id: bySku.get(p.sku)!.id }, data: { imageUrl: `/catalog-images/${file}`, imageAttribution: creditText({ creator: credit.creator, license: credit.license, landingUrl: credit.url }) } });
    }
    fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2));
  }
  return { fetched, missing, credits };
}

async function writeReport(products: HouseProduct[], credits: Record<string, Credit>) {
  const materials = await prisma.material.findMany({ where: { sku: { in: products.map((p) => p.sku) } }, select: { sku: true, imageUrl: true, imageAttribution: true, category: { select: { name: true } } } });
  const bySku = new Map(materials.map((m) => [m.sku, m]));
  const rows = products.map((p, i) => {
    const m = bySku.get(p.sku);
    const credit = credits[p.sku];
    const photo = !m?.imageUrl ? "MISSING" : m.imageUrl.startsWith("/catalog-images/") ? "STOCK (review)" : "OWN";
    return {
      "#": i + 1, SKU: p.sku, Product: p.name, "Arabic name": p.nameAr, Category: m?.category.name ?? p.category, Unit: p.unit,
      "List price (SAR excl. VAT)": p.price, "Your cost (fill in)": "", "Margin %": "", "Min qty": p.minQty, "Lead time (days)": p.leadTimeDays, "Where to buy": p.source,
      Photo: photo, "Photo family": photoGroupFor(p.sku) ?? "", "Photo source": credit ? `${credit.via}: ${credit.title}` : "", "Photo credit / licence": m?.imageAttribution ?? "", "Replace with own photo?": photo === "STOCK (review)" ? "Review" : photo === "MISSING" ? "Yes – add photo" : "",
    };
  });
  const wb = XLSX.utils.book_new();
  const readme = [
    [`MySupplier – Launch catalogue (${products.length} products, Riyadh)`], [],
    ["What this is"], ["Every product MySupplier Direct sells in Phase 0 with its list price, where the ops team buys it, and the photo status. Generated by `pnpm --filter @mysupplier/api catalog:launch` on " + new Date().toISOString().slice(0, 10) + "."], [],
    ["How to use it"],
    ["1. Fill 'Your cost' from your distributor quotes; the Margin column shows the gap to the list price. Change prices in apps/api/prisma/seed-data/house-top200.ts (or in Supplier → My products as direct@mysupplier.sa) and re-run seed:house."],
    ["2. Photos marked STOCK (review) are Creative-Commons photos from Wikimedia Commons, one per product family (all rebar sizes share one rebar photo). Open the shop, and replace any that do not look right with your own photo (Supplier → My products → Photos) or ask the developer to run catalog:launch --reject <family>. The credit line under the gallery is required by the licence until you replace the photo."],
    ["3. Photos marked MISSING had no licensed photo available: upload your own."],
    ["4. Products are priced excl. VAT; VAT 15% is added at checkout. Delivery: 120 SAR per order in Riyadh, free above 3,000 SAR."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), "Read me");
  const ws = XLSX.utils.json_to_sheet(rows);
  rows.forEach((_, i) => { const r = i + 2; ws[`I${r}`] = { t: "n", f: `IF(H${r}="","",(G${r}-H${r})/G${r})`, z: "0%" }; });
  ws["!cols"] = [{ wch: 4 }, { wch: 14 }, { wch: 44 }, { wch: 36 }, { wch: 24 }, { wch: 7 }, { wch: 12 }, { wch: 12 }, { wch: 9 }, { wch: 8 }, { wch: 9 }, { wch: 40 }, { wch: 14 }, { wch: 18 }, { wch: 44 }, { wch: 60 }, { wch: 18 }];
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
  console.log(`Launch catalogue: ${products.length} products in ${new Set(products.map((p) => photoGroupFor(p.sku))).size} photo families`);
  if (args.reject.length) await rejectGroups(args.reject, products);
  if (!args.imagesOnly) {
    const r = await seedHouse(prisma, products);
    console.log(`Products: ${r.materialsCreated} created · listings: ${r.listingsCreated} created, ${r.listingsUpdated} refreshed · valid until ${r.validUntil.toISOString().slice(0, 10)}`);
    if (r.password) console.log(`Ops login ${r.email} / generated password: ${r.password} (change it after first login)`);
  }
  let credits = loadCredits();
  if (!args.skipImages) {
    const r = await fetchPhotos(args, products);
    credits = r.credits;
    console.log(`Photos: ${r.fetched} families fetched, ${r.missing.length} without a usable photo${r.missing.length ? `: ${r.missing.join(", ")}` : ""}`);
  }
  if (!args.dryRun) { await writeReport(products, credits); console.log(`Report: ${REPORT}`); }
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
}
