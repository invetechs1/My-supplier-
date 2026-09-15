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
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  const v4 = ip.replace(/^::ffff:/, "");
  const m = v4.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
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
