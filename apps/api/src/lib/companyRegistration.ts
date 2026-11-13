/**
 * Company block of self-service registration (`POST /auth/register`). Every account – supplier or
 * contractor – must identify its company: name, type, city, CR, VAT, phone; suppliers add the
 * delivery zone (citiesServed). The DB columns stay nullable for legacy rows; the rules live here.
 */
import { z } from "zod";
import { SAUDI_CITIES, regionOfCity } from "@mysupplier/shared";

/** 10-digit commercial registration number (Ministry of Commerce). */
export const CR_REGEX = /^\d{10}$/;
/** 15-digit ZATCA VAT / TIN: starts and ends with 3. */
export const VAT_REGEX = /^3\d{13}3$/;

/**
 * Normalises a Saudi mobile (05X…) or landline (01X…) to E.164. Accepts 05XXXXXXXX, 5XXXXXXXX,
 * +9665XXXXXXXX, 9665XXXXXXXX, 009665XXXXXXXX and the same forms for 1X-area landlines.
 * Returns null when the number is not a valid KSA mobile or landline.
 */
export function normaliseSaudiContact(input: string): string | null {
  let n = input.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (n.startsWith("00966")) n = n.slice(5);
  else if (n.startsWith("966")) n = n.slice(3);
  else if (n.startsWith("0")) n = n.slice(1);
  if (!/^(?:5\d{8}|1[1-7]\d{7})$/.test(n)) return null;
  return `+966${n}`;
}

const saudiPhone = z
  .string()
  .trim()
  .min(9, "Company phone is required")
  .transform((v, ctx) => {
    const normalised = normaliseSaudiContact(v);
    if (!normalised) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a Saudi phone number, e.g. 05XXXXXXXX or 011XXXXXXX" });
    return normalised ?? v;
  });

export const companyTypeSchema = z.enum(["SUPPLIER", "CONTRACTOR", "CONSULTANT", "OTHER"]);

export const registerCompanySchema = z.object({
  name: z.string().trim().min(2, "Company name is required"),
  nameAr: z.string().trim().max(200).optional(),
  type: companyTypeSchema.default("CONTRACTOR"),
  city: z.string().trim().min(2, "City is required"),
  crNumber: z.string().trim().regex(CR_REGEX, "CR number must be exactly 10 digits"),
  vatNumber: z.string().trim().regex(VAT_REGEX, "VAT number must be 15 digits and start and end with 3 (e.g. 3XXXXXXXXXXXXX3)"),
  phone: saudiPhone,
  citiesServed: z.array(z.enum(SAUDI_CITIES)).max(SAUDI_CITIES.length).optional(),
  website: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().url().max(300).optional()),
});
export type RegisterCompanyInput = z.infer<typeof registerCompanySchema>;

/** Prisma `create` data for the company, with the role-dependent type and delivery zone resolved. */
export function companyCreateData(role: "BUYER" | "SUPPLIER", company: RegisterCompanyInput) {
  const supplier = role === "SUPPLIER";
  const citiesServed = supplier ? [...new Set(company.citiesServed ?? [])] : [company.city];
  const { citiesServed: _ignored, ...rest } = company;
  return {
    ...rest,
    // Suppliers are always SUPPLIER; a buyer company can never be a SUPPLIER.
    type: supplier ? ("SUPPLIER" as const) : company.type === "SUPPLIER" ? ("CONTRACTOR" as const) : company.type,
    citiesServed,
    region: regionOfCity(citiesServed[0] ?? company.city),
    branches: { create: { name: "Main branch", city: company.city, isDefault: true } },
  };
}

export const CR_DUPLICATE_MESSAGE = "This CR is already registered — ask the company owner to invite you (Supplier → Team → Invite)";
