import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Returns & Refund Policy · سياسة الإرجاع والاسترداد",
  description: "Returns, cancellations and refunds for building materials ordered through MySupplier, by material family (English and Arabic).",
};

export default function RefundPolicyPage() {
  return <LegalDocument doc="RETURNS_POLICY" />;
}
