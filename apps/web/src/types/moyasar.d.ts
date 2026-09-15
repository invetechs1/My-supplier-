/** Minimal typing for the Moyasar hosted payment form (https://cdn.moyasar.com/mpf/1.14.0/moyasar.js). */
interface MoyasarPayment {
  id: string;
  status: string;
  amount: number;
  currency: string;
  description?: string | null;
  source?: { type?: string; message?: string | null; transaction_url?: string | null } | null;
}

interface MoyasarInitOptions {
  element: string | HTMLElement;
  amount: number;
  currency: string;
  description: string;
  publishable_api_key: string;
  callback_url: string;
  methods?: Array<"creditcard" | "applepay" | "stcpay">;
  metadata?: Record<string, string | number>;
  on_completed?: (payment: MoyasarPayment) => Promise<void> | void;
  on_failure?: (error: unknown) => void;
  on_initiating?: () => Promise<void> | void;
}

interface MoyasarStatic {
  init: (options: MoyasarInitOptions) => void;
}

interface Window {
  Moyasar?: MoyasarStatic;
}
