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

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
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
  api.use("/auth", authRoutes);
  api.use(rfqRoutes);
  api.use(supplierPriceRoutes);
  api.use(orderRoutes);
  api.use(notificationRoutes);
  api.use(adminRoutes);
  app.use("/api/v1", api);

  app.get("/", (_req, res) => res.json({ name: "MySupplier API", docs: "/api/v1/health", version: "v1" }));
  app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
  app.use(errorHandler);
  return app;
}
