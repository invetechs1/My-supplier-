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

/** Static bank-transfer instructions shown on BANK_TRANSFER orders (replace placeholders with the real account). */
export const BANK_TRANSFER_DETAILS = {
  bankName: "Saudi National Bank (SNB)",
  accountName: "MySupplier Trading Co.",
  iban: "SAxx xxxx xxxx xxxx xxxx xxxx",
  swift: "NCBKSAJE",
};
