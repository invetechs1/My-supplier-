import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./lib/env";
import { optionalAuth } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import catalogRoutes from "./routes/catalog";
import rfqRoutes from "./routes/rfqs";
import supplierPriceRoutes from "./routes/supplierPrices";
import orderRoutes from "./routes/orders";
import notificationRoutes from "./routes/notifications";
import adminRoutes from "./routes/admin";
import boqRoutes from "./routes/boq";
import shopRoutes from "./routes/shop";
import cartRoutes from "./routes/cart";
import feedRoutes from "./routes/feeds";
import paymentRoutes from "./routes/payments";
import deviceRoutes from "./routes/devices";
import invoiceRoutes from "./routes/invoice";
import importRoutes from "./routes/imports";
import outreachRoutes from "./routes/outreach";
import portalRoutes from "./routes/supplierPortal";
import orderExtraRoutes from "./routes/orderExtras";
import { PUBLIC_DIR } from "./lib/uploads";
import { initSentry, sentryErrorHandler } from "./lib/monitoring";
import opsRoutes from "./routes/ops";
import otpRoutes from "./routes/otp";
import shippingRoutes from "./routes/shipping";
import einvoiceRoutes from "./routes/einvoice";
import adminCommerceRoutes from "./routes/adminCommerce";

export function createApp() {
  initSentry();
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: env.corsOrigin.includes("*") ? true : env.corsOrigin,
      exposedHeaders: ["X-Unread-Count"],
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  if (env.nodeEnv !== "test") app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
  app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  app.use(optionalAuth);

  const api = express.Router();
  api.use(catalogRoutes);
  api.use(boqRoutes);
  api.use(shopRoutes);
  api.use(cartRoutes);
  api.use(feedRoutes);
  api.use(paymentRoutes);
  api.use(deviceRoutes);
  api.use(invoiceRoutes);
  api.use(importRoutes);
  api.use(outreachRoutes);
  api.use(portalRoutes);
  api.use(orderExtraRoutes);
  api.use(opsRoutes);
  api.use(shippingRoutes);
  api.use(einvoiceRoutes);
  api.use("/auth", authRoutes);
  api.use("/auth", otpRoutes);
  api.use(rfqRoutes);
  api.use(supplierPriceRoutes);
  api.use(orderRoutes);
  api.use(notificationRoutes);
  api.use(adminRoutes);
  api.use(adminCommerceRoutes);
  app.use("/api/v1", api);
  app.use("/uploads", express.static(PUBLIC_DIR, { maxAge: "7d", immutable: true }));

  app.get("/", (_req, res) => res.json({ name: "MySupplier API", docs: "/api/v1/health", version: "v1" }));
  app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
  app.use(sentryErrorHandler);
  app.use(errorHandler);
  return app;
}
