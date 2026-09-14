/**
 * BOQ (bill of quantities) engine.
 *  - parseBoqText: turns pasted text / CSV into structured lines.
 *  - matchLine: fuzzy-matches a free-text description to catalogue materials.
 *  - optimise: builds "cheapest per line", "best single supplier" and per-supplier breakdowns.
 * All functions are pure so they are unit-testable without a database.
 */

export interface BoqLineInput {
  description: string;
  quantity: number;
  unit?: string;
}

export interface CatalogueMaterial {
  id: string;
  sku: string;
  name: string;
  nameAr: string;
  unit: string;
  brand?: string | null;
  categoryName?: string;
  specs?: Record<string, unknown> | null;
}

export interface Candidate {
  material: CatalogueMaterial;
  score: number; // 0..1
}

const UNIT_ALIASES: Record<string, string> = {
  tons: "ton", tonne: "ton", tonnes: "ton", t: "ton", طن: "ton",
  kgs: "kg", kilogram: "kg", كجم: "kg", كغ: "kg",
  bags: "bag", كيس: "bag", شيكارة: "bag", شكارة: "bag",
  "m³": "m3", cum: "m3", cbm: "m3", "cu.m": "m3", "m^3": "m3", م3: "m3", "متر مكعب": "m3",
  "m²": "m2", sqm: "m2", "sq.m": "m2", "m^2": "m2", م2: "m2", "متر مربع": "m2",
  lm: "m", rm: "m", mtr: "m", meter: "m", metre: "m", متر: "m",
  pcs: "piece", pc: "piece", nos: "piece", no: "piece", each: "piece", ea: "piece", unit: "piece", قطعة: "piece", عدد: "piece", حبة: "piece",
  pallets: "pallet", rolls: "roll", lfl: "roll", litres: "litre", liter: "litre", l: "litre", ltr: "litre", لتر: "litre",
  drums: "drum", sheets: "sheet", sht: "sheet", لوح: "sheet", bundles: "bundle",
};

const KNOWN_UNITS = new Set(["ton", "kg", "bag", "m3", "m2", "m", "piece", "pallet", "roll", "litre", "drum", "sheet", "bundle"]);

export function normaliseUnit(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const u = raw.trim().toLowerCase().replace(/\.$/, "");
  if (KNOWN_UNITS.has(u)) return u;
  return UNIT_ALIASES[u];
}

/** Synonyms map both English and Arabic vocab to canonical tokens. */
const SYNONYMS: Record<string, string> = {
  اسمنت: "cement", أسمنت: "cement", سمنت: "cement", opc: "ordinary", portland: "ordinary", عادي: "ordinary", بورتلاندي: "ordinary",
  حديد: "rebar", تسليح: "rebar", steel: "rebar", reinforcement: "rebar", rebars: "rebar", bar: "rebar", bars: "rebar", سيخ: "rebar", اسياخ: "rebar",
  بلوك: "block", blocks: "block", بلك: "block", cmu: "block",
  طوب: "brick", bricks: "brick",
  رمل: "sand", بحص: "aggregate", حصى: "aggregate", gravel: "aggregate", aggregates: "aggregate", agg: "aggregate",
  خرسانة: "concrete", "ready-mix": "readymix", "ready": "readymix", rmc: "readymix", جاهزة: "readymix",
  بلاط: "tile", tiles: "tile", بورسلان: "porcelain", سيراميك: "ceramic", رخام: "marble", جرانيت: "granite",
  دهان: "paint", دهانات: "paint", paints: "paint", بوية: "paint", emulsion: "paint", معجون: "putty", أساس: "primer",
  ماسورة: "pipe", مواسير: "pipe", انابيب: "pipe", أنابيب: "pipe", pipes: "pipe", upvc: "pvc",
  كابل: "cable", كيبل: "cable", كابلات: "cable", cables: "cable", wire: "cable",
  عزل: "insulation", عازل: "insulation", waterproof: "waterproofing", membrane: "membrane",
  خشب: "timber", wood: "timber", بلايوود: "plywood", plywood: "plywood", ply: "plywood", shuttering: "plywood", formwork: "plywood",
  جبس: "gypsum", gypsumboard: "gypsum", plasterboard: "gypsum", drywall: "gypsum",
  باب: "door", ابواب: "door", doors: "door", نافذة: "window", شباك: "window", windows: "window", زجاج: "glass",
  مفرغ: "hollow", مصمت: "solid", عازل_حراري: "thermal",
  انترلوك: "interlock", إنترلوك: "interlock", interlocking: "interlock", paver: "interlock", pavers: "interlock",
  بردورة: "curbstone", kerb: "curbstone", curb: "curbstone", kerbstone: "curbstone",
  mesh: "mesh", شبك: "mesh", brc: "mesh",
  خزان: "tank", tank: "tank", لوحة: "board", db: "distribution",
  white: "white", ابيض: "white", أبيض: "white",
  deformed: "rebar", grade: "grade", "g60": "grade60", "gr60": "grade60",
  مقاوم: "resistant", كبريتات: "sulphate", sulfate: "sulphate", src: "sulphate",
};

const STOP = new Set(["of", "the", "and", "for", "with", "per", "to", "in", "x", "by", "supply", "install", "including", "incl", "type", "size", "as", "spec", "approved", "complete", "works", "من", "في", "مع", "توريد", "تركيب", "و", "حسب", "المواصفات"]);

function normaliseArabic(s: string): string {
  return s
    .replace(/[ً-ْـ]/g, "") // harakat + tatweel
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

export function tokenize(text: string): { words: string[]; numbers: string[] } {
  const clean = normaliseArabic(text.toLowerCase())
    .replace(/["“”'’]/g, " inch ")
    .replace(/[×xX]/g, " x ")
    .replace(/[^\p{L}\p{N}./-]+/gu, " ");
  const numbers = new Set<string>();
  const words: string[] = [];
  for (const raw of clean.split(/\s+/)) {
    if (!raw) continue;
    // 16mm, 20cm, 50kg, c30, 3/4, 60x60, 2.5mm2
    const m = raw.match(/^(\d+(?:[./]\d+)?)([a-z؀-ۿ²³]*)$/u);
    if (m) {
      numbers.add(m[1]);
      if (m[2]) words.push(m[2]);
      continue;
    }
    const grade = raw.match(/^([a-z])(\d+)$/); // c30, b500
    if (grade) {
      numbers.add(grade[2]);
      words.push(grade[1] === "c" ? "concrete" : grade[1]);
      continue;
    }
    if (STOP.has(raw) || raw.length < 2) continue;
    const syn = SYNONYMS[raw] ?? SYNONYMS[normaliseArabic(raw)];
    words.push(syn ?? raw.replace(/s$/, ""));
  }
  return { words: [...new Set(words)], numbers: [...numbers] };
}

export function materialTokens(m: CatalogueMaterial) {
  const specText = m.specs ? Object.values(m.specs).join(" ") : "";
  return tokenize(`${m.name} ${m.nameAr} ${m.brand ?? ""} ${m.categoryName ?? ""} ${specText}`);
}

export function scoreMatch(query: ReturnType<typeof tokenize>, material: CatalogueMaterial, mTokens = materialTokens(material)): number {
  if (!query.words.length && !query.numbers.length) return 0;
  const mWords = new Set(mTokens.words);
  const mNums = new Set(mTokens.numbers);
  let hits = 0;
  for (const w of query.words) {
    if (mWords.has(w)) hits += 1;
    else if ([...mWords].some((mw) => mw.length > 3 && (mw.startsWith(w) || w.startsWith(mw)))) hits += 0.6;
  }
  const wordScore = query.words.length ? hits / query.words.length : 0;
  const coverage = mWords.size ? hits / Math.max(3, mWords.size) : 0;
  let numScore = 0;
  if (query.numbers.length) {
    const numHits = query.numbers.filter((n) => mNums.has(n)).length;
    numScore = numHits / query.numbers.length;
  }
  let score = 0.55 * wordScore + 0.15 * coverage + (query.numbers.length ? 0.3 * numScore : 0.3 * Math.min(1, wordScore));
  // A number mismatch (e.g. 12mm vs 16mm rebar) is a strong negative signal when the material carries numbers.
  if (query.numbers.length && mNums.size && numScore === 0) score *= 0.45;
  return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
}

export function matchLine(description: string, catalogue: CatalogueMaterial[], tokenCache?: Map<string, ReturnType<typeof tokenize>>, limit = 3): Candidate[] {
  const q = tokenize(description);
  const skuHit = catalogue.find((m) => description.toLowerCase().includes(m.sku.toLowerCase()));
  const scored: Candidate[] = catalogue.map((m) => ({
    material: m,
    score: skuHit && skuHit.id === m.id ? 1 : scoreMatch(q, m, tokenCache?.get(m.id) ?? materialTokens(m)),
  }));
  return scored
    .filter((c) => c.score >= 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// --------------------------------------------------------------------- parsing
const QTY_UNIT_RE = /(\d+(?:[.,]\d+)?)\s*(ton|tons|tonne|tonnes|kg|kgs|bags?|m3|m³|cum|cbm|m2|m²|sqm|lm|m|mtr|meter|metre|pcs?|nos?|each|ea|pallets?|rolls?|litres?|liters?|ltr|drums?|sheets?|bundles?|طن|كجم|كيس|م3|م2|متر|قطعة|عدد|حبة|لوح|لتر)(?=\s|$|[,;.)])/iu;

/**
 * Accepts lines like:
 *   "Rebar 16mm, 25, ton"           (csv: description, qty, unit)
 *   "25 ton rebar 16mm"             (qty unit description)
 *   "Hollow block 20cm 8000 pcs"    (description qty unit)
 *   "OPC cement 50kg x 1200"        (description x qty)
 */
export function parseBoqText(text: string): BoqLineInput[] {
  const lines: BoqLineInput[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(item|description|material|بند|الوصف)/i.test(line) && /(qty|quantity|unit|الكمية|الوحدة)/i.test(line)) continue; // header row

    const parts = line.split(/\s*[,;\t|]\s*/).filter(Boolean);
    if (parts.length >= 2) {
      const qtyIdx = parts.findIndex((p, i) => i > 0 && /^\d+(?:[.,]\d+)?$/.test(p));
      if (qtyIdx > 0) {
        const quantity = Number(parts[qtyIdx].replace(",", "."));
        const unit = normaliseUnit(parts[qtyIdx + 1]) ?? normaliseUnit(parts[qtyIdx - 1]);
        const description = parts.filter((_, i) => i !== qtyIdx && i !== qtyIdx + 1).join(" ").trim();
        if (description && quantity > 0) {
          lines.push({ description, quantity, unit });
          continue;
        }
      }
    }
    const m = line.match(QTY_UNIT_RE);
    if (m) {
      const quantity = Number(m[1].replace(",", "."));
      const unit = normaliseUnit(m[2]);
      const description = (line.slice(0, m.index) + " " + line.slice((m.index ?? 0) + m[0].length)).replace(/\s+x\s*$/i, "").trim();
      if (description && quantity > 0) {
        lines.push({ description, quantity, unit });
        continue;
      }
    }
    const trailing = line.match(/^(.*?)(?:\s*[x×*:-]\s*|\s+)(\d+(?:[.,]\d+)?)\s*$/i);
    if (trailing && trailing[1].trim()) {
      lines.push({ description: trailing[1].trim(), quantity: Number(trailing[2].replace(",", ".")) });
      continue;
    }
    lines.push({ description: line, quantity: 1 });
  }
  return lines;
}

// ---------------------------------------------------------------- optimisation
export interface OfferLike {
  listingId: string;
  supplierId: string; // company id or "market:<sourceName>"
  supplierName: string;
  verified: boolean;
  city: string;
  price: number;
  minQty: number;
  leadTimeDays: number;
  source: string;
}

export interface LineForOptimiser {
  index: number;
  quantity: number;
  offers: OfferLike[]; // sorted asc by price
}

export interface SupplierBreakdown {
  supplierId: string;
  supplierName: string;
  verified: boolean;
  city: string;
  linesCovered: number;
  coveragePct: number;
  total: number; // for covered lines
  avgLeadTimeDays: number;
  lines: Array<{ index: number; listingId: string; unitPrice: number; lineTotal: number }>;
}

export function optimise(lines: LineForOptimiser[]) {
  const matchedLines = lines.filter((l) => l.offers.length);
  const cheapestPerLine = matchedLines.map((l) => {
    const best = l.offers[0];
    return { index: l.index, listingId: best.listingId, supplierId: best.supplierId, supplierName: best.supplierName, unitPrice: best.price, lineTotal: round2(best.price * l.quantity) };
  });
  const cheapestTotal = round2(cheapestPerLine.reduce((s, l) => s + l.lineTotal, 0));
  const averageTotal = round2(matchedLines.reduce((s, l) => s + (l.offers.reduce((a, o) => a + o.price, 0) / l.offers.length) * l.quantity, 0));
  const highestTotal = round2(matchedLines.reduce((s, l) => s + l.offers[l.offers.length - 1].price * l.quantity, 0));

  const bySupplier = new Map<string, SupplierBreakdown>();
  for (const l of matchedLines) {
    for (const o of l.offers) {
      let b = bySupplier.get(o.supplierId);
      if (!b) {
        b = { supplierId: o.supplierId, supplierName: o.supplierName, verified: o.verified, city: o.city, linesCovered: 0, coveragePct: 0, total: 0, avgLeadTimeDays: 0, lines: [] };
        bySupplier.set(o.supplierId, b);
      }
      if (b.lines.some((x) => x.index === l.index)) continue; // one offer per supplier per line (cheapest first)
      b.lines.push({ index: l.index, listingId: o.listingId, unitPrice: o.price, lineTotal: round2(o.price * l.quantity) });
      b.linesCovered++;
      b.total = round2(b.total + o.price * l.quantity);
      b.avgLeadTimeDays += o.leadTimeDays;
    }
  }
  const suppliers = [...bySupplier.values()].map((b) => ({
    ...b,
    coveragePct: matchedLines.length ? Math.round((b.linesCovered / matchedLines.length) * 100) : 0,
    avgLeadTimeDays: b.linesCovered ? Math.round(b.avgLeadTimeDays / b.linesCovered) : 0,
  }));
  // Best single supplier: most coverage first, then lowest total.
  suppliers.sort((a, b) => b.linesCovered - a.linesCovered || a.total - b.total);
  const bestSingle = suppliers[0] ?? null;
  const distinctSuppliersInCheapest = new Set(cheapestPerLine.map((l) => l.supplierId)).size;

  return {
    cheapestPerLine,
    cheapestTotal,
    averageTotal,
    highestTotal,
    savingsVsAverage: round2(averageTotal - cheapestTotal),
    savingsVsHighest: round2(highestTotal - cheapestTotal),
    distinctSuppliersInCheapest,
    bestSingleSupplier: bestSingle,
    suppliers,
    matchedLines: matchedLines.length,
    unmatchedLines: lines.length - matchedLines.length,
  };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
