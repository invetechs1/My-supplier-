/**
 * AI document reading for price lists and quotations.
 * Uses Claude (Anthropic SDK) with structured outputs. When no API key is configured the
 * heuristic text parser is used instead (works for pasted text, CSV and Excel; not for PDFs/images).
 */
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { z } from "zod";
import * as XLSX from "xlsx";
import { env } from "../lib/env";

export const AI_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
export const MAX_FILE_MB = 15;
export const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
];

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const ExtractedRow = z.object({
  name: z.string().describe("Item description exactly as written, cleaned of codes/prices"),
  nameAr: z.string().nullable().describe("Arabic name if the document shows one"),
  brand: z.string().nullable(),
  unit: z.string().nullable().describe("Unit of measure as written, e.g. ton, bag, m3, m2, pcs, roll"),
  price: z.number().nullable().describe("Unit price in SAR excluding VAT when both are shown; null if no price"),
  quantity: z.number().nullable().describe("Quantity if this is a quotation line"),
  city: z.string().nullable().describe("Delivery / branch city if stated for this line"),
  notes: z.string().nullable(),
});

const Extraction = z.object({
  documentType: z.enum(["price_list", "quotation", "invoice", "other"]),
  supplierName: z.string().nullable(),
  supplierPhone: z.string().nullable(),
  city: z.string().nullable(),
  currency: z.string().nullable(),
  pricesIncludeVat: z.boolean().nullable(),
  documentDate: z.string().nullable().describe("ISO date if printed"),
  rows: z.array(ExtractedRow),
});

export type Extraction = z.infer<typeof Extraction>;

/** JSON schema mirror of `Extraction` for the API's structured-output format (validated again with zod). */
const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["documentType", "supplierName", "supplierPhone", "city", "currency", "pricesIncludeVat", "documentDate", "rows"],
  properties: {
    documentType: { type: "string", enum: ["price_list", "quotation", "invoice", "other"] },
    supplierName: { type: ["string", "null"] },
    supplierPhone: { type: ["string", "null"] },
    city: { type: ["string", "null"], description: "Main city / branch of the supplier if stated" },
    currency: { type: ["string", "null"] },
    pricesIncludeVat: { type: ["boolean", "null"] },
    documentDate: { type: ["string", "null"], description: "ISO date if printed" },
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "nameAr", "brand", "unit", "price", "quantity", "city", "notes"],
        properties: {
          name: { type: "string", description: "Item description exactly as written, cleaned of codes/prices" },
          nameAr: { type: ["string", "null"], description: "Arabic name if the document shows one" },
          brand: { type: ["string", "null"] },
          unit: { type: ["string", "null"], description: "Unit of measure as written, e.g. ton, bag, m3, m2, pcs, roll" },
          price: { type: ["number", "null"], description: "Unit price in SAR excluding VAT when both are shown; null if no price" },
          quantity: { type: ["number", "null"], description: "Quantity if this is a quotation line" },
          city: { type: ["string", "null"], description: "Delivery / branch city if stated for this line" },
          notes: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;
export type ExtractedRow = z.infer<typeof ExtractedRow>;

export interface ExtractInput {
  text?: string;
  file?: { buffer: Buffer; mimeType: string; fileName?: string };
  hints?: { city?: string; supplierName?: string; kind?: string };
}

const SYSTEM = `You read Saudi construction-material price lists, quotations and supplier catalogues (English and Arabic) and return every priced line item as structured data.
Rules:
- One output row per item line. Keep the item description faithful; put sizes/grades in the name (e.g. "Rebar 16mm Grade 60").
- Prices are in SAR unless the document clearly says otherwise; convert "1,250.00" style numbers to plain numbers. If a line shows both price excl. and incl. VAT (15%), return the price EXCLUDING VAT and set pricesIncludeVat=false. If only an incl.-VAT price is shown, return it and set pricesIncludeVat=true.
- Units: use the unit as written (ton, kg, bag, m3, m2, m, piece/pcs, pallet, roll, litre, drum, sheet, bundle).
- Ignore headers, totals, terms, bank details and lines without an item.
- Do not invent prices; use null when a line has no price.`;

/** Converts spreadsheets/CSV to plain text so both AI and heuristics can read them. */
export function spreadsheetToText(buffer: Buffer, mimeType: string): string {
  if (mimeType === "text/csv" || mimeType === "text/plain") return buffer.toString("utf8");
  if (buffer.length > 8 * 1024 * 1024) throw new Error("Spreadsheets are limited to 8 MB – export the price list as CSV or split it");
  // Bounded parse: dense sheets, first 5,000 rows, no formulas/styles/VML – reduces the attack surface of crafted workbooks.
  const wb = XLSX.read(buffer, { type: "buffer", dense: true, sheetRows: 5000, cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false });
  const parts: string[] = [];
  for (const name of wb.SheetNames.slice(0, 5)) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
    parts.push(`## Sheet: ${name}\n${csv}`);
  }
  return parts.join("\n\n");
}

export const isSpreadsheet = (mime: string) =>
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv", "text/plain"].includes(mime);

function userPrompt(hints?: ExtractInput["hints"]) {
  const h: string[] = [];
  if (hints?.supplierName) h.push(`The supplier is believed to be "${hints.supplierName}".`);
  if (hints?.city) h.push(`Default city: ${hints.city}.`);
  if (hints?.kind === "BUYER_QUOTATION") h.push("This is a quotation received by a contractor.");
  return `Extract all priced items from this document.${h.length ? " " + h.join(" ") : ""}`;
}

/** AI extraction with Claude structured outputs. Throws when AI is not configured. */
export async function extractWithAi(input: ExtractInput): Promise<{ extraction: Extraction; model: string; usage: { input: number; output: number } }> {
  if (!aiEnabled()) throw new Error("AI is not configured (set ANTHROPIC_API_KEY)");
  const client = new Anthropic({ timeout: 10 * 60_000 });
  const content: Anthropic.ContentBlockParam[] = [];
  if (input.file) {
    const { buffer, mimeType } = input.file;
    if (mimeType === "application/pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } });
    } else if (mimeType.startsWith("image/")) {
      content.push({ type: "image", source: { type: "base64", media_type: mimeType as "image/png" | "image/jpeg" | "image/webp", data: buffer.toString("base64") } });
    } else if (isSpreadsheet(mimeType)) {
      content.push({ type: "text", text: `<document name="${input.file.fileName ?? "sheet"}">\n${spreadsheetToText(buffer, mimeType).slice(0, 400_000)}\n</document>` });
    } else {
      throw new Error(`Unsupported file type ${mimeType}`);
    }
  }
  if (input.text) content.push({ type: "text", text: `<document>\n${input.text.slice(0, 400_000)}\n</document>` });
  content.push({ type: "text", text: userPrompt(input.hints) });

  const response = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 32_000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { format: jsonSchemaOutputFormat(EXTRACTION_SCHEMA), effort: "medium" },
  });
  if (response.stop_reason === "refusal") throw new Error("The model declined to read this document");
  if (response.stop_reason === "max_tokens") throw new Error("The document is too long to read in one pass; split it and try again");
  if (!response.parsed_output) throw new Error("Could not parse the document");
  const extraction = Extraction.parse(response.parsed_output);
  return { extraction, model: response.model, usage: { input: response.usage.input_tokens, output: response.usage.output_tokens } };
}

// ------------------------------------------------------------------ heuristics
const UNIT_WORDS = ["ton", "tons", "tonne", "tonnes", "kg", "kgs", "bag", "bags", "m3", "m³", "cum", "cbm", "m2", "m²", "sqm", "lm", "mtr", "m", "pc", "pcs", "piece", "pieces", "no", "nos", "each", "ea", "pallet", "pallets", "roll", "rolls", "litre", "liter", "ltr", "l", "drum", "drums", "sheet", "sheets", "bundle", "bundles", "طن", "كجم", "كيس", "م3", "م2", "متر", "قطعة", "عدد", "حبة", "لوح", "لتر"];
const UNIT_SET = new Set(UNIT_WORDS);
const CURRENCY_RE = /\b(SAR|SR|ريال|ر\.س\.?)\b|ر\.س/gi;
const SKIP_RE = /^(item|description|material|name|sn|s\.n|no\.?|code|unit|price|qty|بند|الوصف|الصنف|sheet:|##)|^(total|sub ?total|vat|grand|discount|المجموع|الإجمالي|الضريبة)/i;

function parseNumber(cell: string): number | null {
  const cleaned = cell.replace(CURRENCY_RE, "").trim().replace(/^(\d{1,3})((?:,\d{3})+)(\.\d+)?$/, (_m, a: string, b: string, c: string) => a + b.replace(/,/g, "") + (c ?? ""));
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Heuristic extraction for text/CSV when AI is unavailable: split each line into cells
 * (commas, tabs, pipes, dashes, multiple spaces), take the last numeric cell as the price,
 * a unit-word cell as the unit, and the rest as the item name.
 */
export function extractHeuristically(text: string, hints?: ExtractInput["hints"]): Extraction {
  const rows: ExtractedRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || SKIP_RE.test(line)) continue;
    // Collapse thousands separators only in standalone numbers ("SAR 2,650" -> 2650), never inside codes like "C30,120".
    const protectedLine = line.replace(/(^|[^\p{L}\p{N}.])(\d{1,3})((?:,\d{3})+)(\.\d+)?(?![\p{L}\p{N}])/gu, (_m, pre: string, a: string, b: string, c: string) => pre + a + b.replace(/,/g, "") + (c ?? ""));
    let cells = protectedLine.split(/\s*(?:,|\t|\||;|\s[–—-]\s|\s{2,})\s*/).map((c) => c.trim()).filter(Boolean);
    let price: number | null = null;
    let unit: string | null = null;
    let quantity: number | null = null;

    if (cells.length >= 2) {
      for (let i = cells.length - 1; i >= 1; i--) {
        const n = parseNumber(cells[i]);
        if (n !== null) { price = n; cells.splice(i, 1); break; }
      }
      const unitIdx = cells.findIndex((c, i) => i > 0 && UNIT_SET.has(c.toLowerCase()));
      if (unitIdx > 0) { unit = cells[unitIdx]; cells.splice(unitIdx, 1); }
      // Remaining numeric cells (e.g. quantity or serial number) are not part of the name.
      cells = cells.filter((c, i) => {
        if (i === 0 && !/^\d+(?:\.\d+)?$/.test(c)) return true;
        const n = parseNumber(c);
        if (n === null) return true;
        if (quantity === null && i > 0) quantity = n;
        return false;
      });
    }
    if (price === null) {
      // single-cell layout: "... 15.75" / "... SAR 2650" / "... 2650 SR"
      const m = protectedLine.match(/(?:SAR|SR|ر\.س)?\s*(\d+(?:\.\d+)?)\s*(?:SAR|SR|ر\.س|ريال)?\s*$/i);
      if (!m) continue;
      price = Number(m[1]);
      if (!(price > 0)) continue;
      const before = protectedLine.slice(0, m.index).trim();
      const tokens = before.split(/\s+/);
      if (tokens.length > 1 && UNIT_SET.has(tokens[tokens.length - 1].toLowerCase())) unit = tokens.pop()!;
      cells = [tokens.join(" ")];
    }
    const name = cells.join(" ").replace(CURRENCY_RE, "").replace(/[,:;–-]+$/, "").replace(/\s+/g, " ").trim();
    if (name.length < 3 || !/[\p{L}]{2,}/u.test(name)) continue;
    rows.push({ name, nameAr: null, brand: null, unit, price, quantity, city: hints?.city ?? null, notes: null });
  }
  return { documentType: hints?.kind === "BUYER_QUOTATION" ? "quotation" : "price_list", supplierName: hints?.supplierName ?? null, supplierPhone: null, city: hints?.city ?? null, currency: "SAR", pricesIncludeVat: null, documentDate: null, rows };
}

/** Chooses AI when available (or required for PDFs/images), otherwise heuristics. */
export async function extractPrices(input: ExtractInput): Promise<{ extraction: Extraction; aiUsed: boolean; model: string | null }> {
  const needsAi = Boolean(input.file && (input.file.mimeType === "application/pdf" || input.file.mimeType.startsWith("image/")));
  if (aiEnabled()) {
    const r = await extractWithAi(input);
    return { extraction: r.extraction, aiUsed: true, model: r.model };
  }
  if (needsAi) throw new Error("Reading PDFs and photos requires the AI service (ANTHROPIC_API_KEY). Paste the text or upload CSV/Excel instead.");
  const text = input.file ? spreadsheetToText(input.file.buffer, input.file.mimeType) : (input.text ?? "");
  return { extraction: extractHeuristically(text, input.hints), aiUsed: false, model: null };
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(tr|p|div|li|h\d|table)>/gi, "\n")
    .replace(/<\/(td|th)>/gi, " , ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export const aiConfig = () => ({ enabled: aiEnabled(), model: aiEnabled() ? AI_MODEL : null, maxFileMb: MAX_FILE_MB, acceptedTypes: ACCEPTED_TYPES, webUrl: env.webUrl });
