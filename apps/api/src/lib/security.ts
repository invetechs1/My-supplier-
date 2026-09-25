import dns from "dns/promises";
import net from "net";

/** Rejects URLs that point at private / loopback / link-local networks (SSRF guard for admin-supplied feed URLs). */
export async function assertPublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http(s) URLs are allowed");
  if (process.env.ALLOW_PRIVATE_FEED_URLS === "true") return; // local development / tests
  const host = url.hostname;
  const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  for (const ip of addresses) if (isPrivateIp(ip)) throw new Error("URL resolves to a private network address");
}

export function isPrivateIp(ip: string): boolean {
  let addr = ip.trim().toLowerCase();
  if (addr.startsWith("[") && addr.endsWith("]")) addr = addr.slice(1, -1);
  if (addr === "::" || addr === "::1") return true;
  // IPv4-mapped (dotted or hex) → evaluate the embedded IPv4 address.
  const mapped = addr.match(/^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
  if (mapped) {
    if (mapped[1]) addr = mapped[1];
    else { const hi = parseInt(mapped[2], 16), lo = parseInt(mapped[3], 16); addr = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`; }
  }
  if (addr.includes(":")) {
    // NAT64, 6to4, Teredo and non-global ranges could reach internal IPv4 space or the host itself.
    return addr.startsWith("64:ff9b:") || addr.startsWith("2002:") || addr.startsWith("2001:0:") || addr.startsWith("fe80:") || addr.startsWith("fec0:") || addr.startsWith("fc") || addr.startsWith("fd") || addr.startsWith("::");
  }
  const m = addr.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19));
}

/** Escapes a CSV cell and neutralises spreadsheet formula injection (=, +, -, @, tab, CR). */
export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Normalises Saudi mobile numbers to E.164 (+9665xxxxxxxx). Returns null when not a valid KSA mobile. */
export function normaliseSaudiPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let n = digits.replace(/^\+/, "");
  if (n.startsWith("00966")) n = n.slice(5);
  else if (n.startsWith("966")) n = n.slice(3);
  else if (n.startsWith("0")) n = n.slice(1);
  if (!/^5\d{8}$/.test(n)) return null;
  return `+966${n}`;
}

import { z } from "zod";
/** URL that is safe to render as a link or image source: http(s) only, no javascript:/data: schemes. */
export const httpUrl = z.string().trim().max(600).url().refine((u) => /^https?:\/\//i.test(u), "Only http(s) URLs are allowed");
