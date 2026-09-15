/**
 * Saudi mobile numbers: users type 05xxxxxxxx; the API wants E.164 (+9665xxxxxxxx).
 * Returns null when the input is not a recognisable Saudi mobile number.
 */
export function normalizeSaudiMobile(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;
  let local: string | null = null;
  if (/^\+9665\d{8}$/.test(digits)) return digits;
  if (/^009665\d{8}$/.test(digits)) local = digits.slice(6);
  else if (/^9665\d{8}$/.test(digits)) local = digits.slice(4);
  else if (/^05\d{8}$/.test(digits)) local = digits.slice(2);
  else if (/^5\d{8}$/.test(digits)) local = digits.slice(1);
  if (!local) return null;
  return `+9665${local}`;
}

/** +9665xxxxxxxx -> 05xx xxx xxxx for display. */
export function formatSaudiMobile(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+966(5\d{8})$/.exec(e164);
  if (!m) return e164;
  const n = `0${m[1]}`;
  return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
}
