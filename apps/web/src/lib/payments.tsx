"use client";

import { useEffect, useState } from "react";
import type { PaymentConfig } from "@mysupplier/shared";
import { api } from "./api";

/** Sensible fallback when the API is unreachable: card payments are treated as disabled. */
export const DISABLED_PAYMENT_CONFIG: PaymentConfig = {
  provider: "MANUAL",
  cardPaymentsEnabled: false,
  publishableKey: null,
  currency: "SAR",
  methods: ["COD", "BANK_TRANSFER"],
};

let cached: PaymentConfig | null = null;
let inflight: Promise<PaymentConfig> | null = null;

/** Load GET /payments/config once per session and share it across components. */
export function loadPaymentConfig(): Promise<PaymentConfig> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api
      .paymentsConfig()
      .then((cfg) => {
        cached = cfg;
        return cfg;
      })
      .catch(() => DISABLED_PAYMENT_CONFIG)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function usePaymentConfig(): { config: PaymentConfig | null; loading: boolean } {
  const [config, setConfig] = useState<PaymentConfig | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let active = true;
    void loadPaymentConfig().then((cfg) => {
      if (!active) return;
      setConfig(cfg);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return { config, loading };
}

/** Fallback brand list when the config has not loaded yet (matches the default MOYASAR_METHODS). */
export const DEFAULT_BRANDS = ["mada", "Visa", "Mastercard", "Apple Pay", "STC Pay"];
export const brandsLine = (brands?: string[] | null) => (brands && brands.length ? brands : DEFAULT_BRANDS).join(" · ");
