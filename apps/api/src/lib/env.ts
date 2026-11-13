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
    /** Moyasar form methods (mada is part of creditcard). Apple Pay also needs the domain verification file – see docs/INTEGRATIONS.md. */
    methods: (process.env.MOYASAR_METHODS ?? "creditcard,applepay,stcpay").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  },
  // Legal entity shown on invoices (ZATCA QR).
  seller: {
    name: process.env.PLATFORM_LEGAL_NAME ?? "MySupplier Trading Co.",
    vatNumber: process.env.PLATFORM_VAT_NUMBER ?? "300000000000003",
    address: process.env.PLATFORM_ADDRESS ?? "Riyadh, Kingdom of Saudi Arabia",
  },
  vatRate: Number(process.env.VAT_RATE ?? 0.15),
  // Carriers (services/carriers). Per-carrier keys are read lazily by the adapters: <CARRIER>_API_KEY, <CARRIER>_API_URL,
  // <CARRIER>_WEBHOOK_SECRET (+ ARAMEX_USERNAME/ACCOUNT_NUMBER/ACCOUNT_PIN/ACCOUNT_ENTITY, SMSA_CUSTOMER_CODE, SPL_CUSTOMER_ID).
  carriers: {
    /** CARRIER_SANDBOX=1: configured carriers book deterministic "SBX-" shipments without network calls. */
    get sandbox() { return /^(1|true|yes)$/i.test(process.env.CARRIER_SANDBOX ?? ""); },
    /** Legacy shared webhook token, still accepted when a carrier has no <CARRIER>_WEBHOOK_SECRET. */
    get webhookSecret() { return process.env.CARRIER_WEBHOOK_SECRET ?? ""; },
    /** Open shipments refreshed per hourly poll. */
    pollLimit: Number(process.env.CARRIER_POLL_LIMIT ?? 50),
  },
  bank: {
    name: process.env.BANK_NAME ?? "Al Rajhi Bank",
    iban: process.env.BANK_IBAN ?? "SA00 0000 0000 0000 0000 0000",
    beneficiary: process.env.BANK_BENEFICIARY ?? "MySupplier Trading Co.",
  },
};
