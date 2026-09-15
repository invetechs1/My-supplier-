import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY, LegalNav, ProsePage, Section } from "@/components/legal/Prose";

export const metadata: Metadata = {
  title: "About",
  description: "MySupplier brings transparent construction-material pricing, RFQ bidding and verified suppliers to contractors across Saudi Arabia.",
};

const STATS = [
  { label: "Cities covered", value: "13+" },
  { label: "Material categories", value: "40+" },
  { label: "Supplier verification", value: "CR + VAT" },
  { label: "Invoices", value: "ZATCA-ready" },
];

export default function AboutPage() {
  return (
    <ProsePage title="About MySupplier" subtitle="Transparent building-material pricing for the Kingdom — built for contractors, consultants and suppliers." aside={<LegalNav />}>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
            <p className="text-xl font-semibold text-brand-700">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>
      <Section title="Our mission">
        <p>Construction is the backbone of Vision 2030, yet material procurement still runs on phone calls, WhatsApp photos of price lists and last-minute site purchases. MySupplier replaces that with a single place to see real prices, request quotes, compare bids and order — so projects finish on budget and suppliers win business on merit.</p>
      </Section>
      <Section title="How we collect prices">
        <p>Prices come from three sources, each labelled clearly: <strong>supplier</strong> prices published by verified suppliers from their own dashboards or catalogue feeds; <strong>imported</strong> prices from supplier files we load on their behalf; and <strong>market</strong> reference prices aggregated from published sources to benchmark offers. Every listing shows the city, unit, minimum quantity and the date it was last updated.</p>
      </Section>
      <Section title="Verified suppliers">
        <p>Before a supplier is marked Verified we check its Commercial Registration and VAT registration with the relevant authorities and confirm the trading contact. Buyers can filter BOQ pricing and RFQs to verified suppliers only.</p>
      </Section>
      <Section title="Compliance">
        <p>Every order produces a simplified tax invoice with the ZATCA phase-1 QR code, VAT at 15% is itemised, and card payments are processed by a SAMA-licensed provider. Personal data is handled under the Saudi Personal Data Protection Law — see our <Link href="/privacy" className="font-semibold text-brand-700 hover:underline">Privacy Policy</Link>.</p>
      </Section>
      <Section title="Company">
        <p>{COMPANY.legalName} · CR {COMPANY.crNumber} · VAT {COMPANY.vatNumber}<br />{COMPANY.address}</p>
        <p>
          Want to list your products? <Link href="/register?role=SUPPLIER" className="font-semibold text-brand-700 hover:underline">Join as a supplier</Link>. Buying for a project? <Link href="/boq" className="font-semibold text-brand-700 hover:underline">Price your BOQ</Link> in seconds.
        </p>
      </Section>
    </ProsePage>
  );
}
