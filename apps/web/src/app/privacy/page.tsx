import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy · سياسة الخصوصية",
  description: "How MySupplier collects, uses and protects personal data under the Saudi Personal Data Protection Law (PDPL).",
};

export default function PrivacyPage() {
  return <LegalDocument doc="PRIVACY" />;
}
