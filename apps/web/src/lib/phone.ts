/** Saudi mobile numbers: 05xxxxxxxx, 5xxxxxxxx, 9665xxxxxxxx, +9665xxxxxxxx, 009665xxxxxxxx → +9665xxxxxxxx. */
export function normaliseSaudiPhone(input: string): string | null {
  // Convert Arabic-Indic digits and strip everything but digits and a leading plus.
  const ascii = input.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  let digits = ascii.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("966")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!/^5\d{8}$/.test(digits)) return null;
  return `+966${digits}`;
}

/** +9665xxxxxxxx → "05x xxx xxxx" for display. */
export function formatSaudiPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const n = normaliseSaudiPhone(e164);
  if (!n) return e164;
  const local = `0${n.slice(4)}`;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}
