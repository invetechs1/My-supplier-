/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

/** Origin of the API (without `/api/v1`) resolved at build/config time for `connect-src`. */
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1").origin;
  } catch {
    return "http://localhost:4000";
  }
})();

const connectSrc = ["'self'", apiOrigin, ...(isDev ? ["http://localhost:4000", "ws:"] : []), "https://api.moyasar.com", "https://apimig.moyasar.com"];

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // 'unsafe-eval' is only needed by the Next.js dev runtime (HMR / source maps).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://cdn.moyasar.com`,
  "style-src 'self' 'unsafe-inline' https://cdn.moyasar.com https://fonts.googleapis.com",
  "img-src 'self' data: blob: https: http://localhost:4000",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src ${[...new Set(connectSrc)].join(" ")}`,
  "frame-src https://www.youtube.com https://player.vimeo.com https://*.moyasar.com",
  "media-src 'self' https:",
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@mysupplier/shared"],
  output: "standalone",
  experimental: {
    outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  },
  // next/image is not used; plain <img> tags load from the API origin and external CDNs.
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
