import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Terms & Conditions · الشروط والأحكام",
  description: "Terms governing the use of the MySupplier construction-materials marketplace in Saudi Arabia (English and Arabic).",
};

export default function TermsPage() {
  return <LegalDocument doc="TERMS" />;
}
