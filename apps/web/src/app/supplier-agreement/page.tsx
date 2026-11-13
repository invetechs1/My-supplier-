import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Supplier Agreement · اتفاقية المورد",
  description: "The agreement between MySupplier and companies that list and sell building materials on the platform: fees, SLAs, returns, payouts (English and Arabic).",
};

export default function SupplierAgreementPage() {
  return <LegalDocument doc="SUPPLIER_AGREEMENT" />;
}
