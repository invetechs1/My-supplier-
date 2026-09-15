import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MySupplier — Building material prices in Saudi Arabia",
    short_name: "MySupplier",
    description: "Compare construction material prices, request quotes and order from verified suppliers across Saudi Arabia.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0B6E4F",
    lang: "en",
    dir: "auto",
    categories: ["business", "shopping", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Shop", url: "/shop", description: "Browse live prices" },
      { name: "BOQ pricing", url: "/boq", description: "Price a bill of quantities" },
      { name: "My orders", url: "/dashboard/orders", description: "Track orders" },
    ],
  };
}
