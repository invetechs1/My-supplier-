import "dotenv/config";

const isProd = process.env.NODE_ENV === "production";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing required env var ${name}`);
  return v;
}

const jwtSecret = required("JWT_SECRET", isProd ? undefined : "dev-only-secret-change-me");
if (isProd && (jwtSecret.length < 32 || jwtSecret.includes("change-me"))) {
  throw new Error("JWT_SECRET must be a random string of at least 32 characters in production");
}

export const env = {
  isProd,
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  corsOrigin: (process.env.CORS_ORIGIN ?? "*").split(",").map((s) => s.trim()),
  /** Public URLs used in emails, invoices and payment callbacks. */
  apiUrl: process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}/api/v1`,
  webUrl: process.env.WEB_URL ?? "http://localhost:3000",
  appScheme: process.env.APP_SCHEME ?? "mysupplier",
  version: process.env.APP_VERSION ?? process.env.npm_package_version ?? "1.0.0",
  // Email (SMTP). When SMTP_HOST is empty, emails are logged instead of sent.
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.MAIL_FROM ?? "MySupplier <no-reply@mysupplier.sa>",
  },
  // Payments (Moyasar). Card payments are enabled only when both keys are present.
  moyasar: {
    secretKey: process.env.MOYASAR_SECRET_KEY ?? "",
    publishableKey: process.env.MOYASAR_PUBLISHABLE_KEY ?? "",
    webhookSecret: process.env.MOYASAR_WEBHOOK_SECRET ?? "",
    apiBase: process.env.MOYASAR_API_BASE ?? "https://api.moyasar.com/v1",
  },
  // Legal entity shown on invoices (ZATCA QR).
  seller: {
    name: process.env.PLATFORM_LEGAL_NAME ?? "MySupplier Trading Co.",
    vatNumber: process.env.PLATFORM_VAT_NUMBER ?? "300000000000003",
    address: process.env.PLATFORM_ADDRESS ?? "Riyadh, Kingdom of Saudi Arabia",
  },
  vatRate: Number(process.env.VAT_RATE ?? 0.15),
  bank: {
    name: process.env.BANK_NAME ?? "Al Rajhi Bank",
    iban: process.env.BANK_IBAN ?? "SA00 0000 0000 0000 0000 0000",
    beneficiary: process.env.BANK_BENEFICIARY ?? "MySupplier Trading Co.",
  },
};
