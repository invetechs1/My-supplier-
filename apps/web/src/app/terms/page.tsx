import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY, LegalNav, ProsePage, Section } from "@/components/legal/Prose";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing the use of the MySupplier construction-materials marketplace in Saudi Arabia.",
};

export default function TermsPage() {
  return (
    <ProsePage title="Terms of Service" subtitle="These terms govern your use of the MySupplier marketplace for construction materials in the Kingdom of Saudi Arabia." updated="1 September 2026" aside={<LegalNav />}>
      <Section title="1. Who we are">
        <p>
          MySupplier is operated by {COMPANY.legalName}, a company registered in the Kingdom of Saudi Arabia (Commercial Registration {COMPANY.crNumber}, VAT registration {COMPANY.vatNumber}) with its registered office at {COMPANY.address}. References to <strong>“we”</strong>, <strong>“us”</strong> and <strong>“the Platform”</strong> mean MySupplier.
        </p>
        <p>MySupplier is a business-to-business marketplace. By registering you confirm that you are acting in the course of a trade, business or profession, and that you are authorised to bind the company you represent.</p>
      </Section>
      <Section title="2. What the Platform does">
        <ul>
          <li><strong>Price discovery.</strong> We publish live and reference prices for building materials (cement, steel, aggregates, blocks, finishing materials and more) collected from supplier price lists, supplier catalogue feeds and published market sources.</li>
          <li><strong>Requests for quotation (RFQs) and bidding.</strong> Buyers publish RFQs; verified suppliers submit itemised bids; buyers award an order to the bid of their choice.</li>
          <li><strong>Direct shop orders.</strong> Buyers may order listed products directly from a supplier at the published price.</li>
          <li><strong>Invoicing and payments.</strong> We issue simplified tax invoices on behalf of the selling supplier and, where enabled, process card payments through a licensed payment service provider.</li>
        </ul>
        <p>MySupplier is not the seller of goods unless expressly stated on the invoice. Each order forms a contract between the buyer and the supplier named on the order. We act as a marketplace operator and commercial agent for collection of payment where applicable.</p>
      </Section>
      <Section title="3. Accounts, verification and eligibility">
        <p>You must provide accurate information when registering. Suppliers must provide a valid Commercial Registration (CR) number and, where registered, a 15-digit VAT number. We verify CR and VAT details against public records before a supplier is marked <strong>Verified</strong>, and we may suspend or remove a supplier whose registration lapses.</p>
        <p>You are responsible for keeping your password confidential and for all activity under your account. Notify us immediately at {COMPANY.supportEmail} if you suspect unauthorised use.</p>
      </Section>
      <Section title="4. Prices, VAT and invoices">
        <ul>
          <li>All prices are displayed in Saudi Riyals (SAR). Unless clearly marked otherwise, listed prices exclude value added tax; VAT at the statutory rate (currently <strong>15%</strong>) is added at checkout and itemised on the invoice.</li>
          <li><strong>Market</strong> or <strong>reference</strong> prices are indicative and cannot be ordered; they help you benchmark supplier offers.</li>
          <li>Supplier prices may change without notice until an order is confirmed. A confirmed order or accepted bid fixes the price for that order.</li>
          <li>Invoices are issued electronically in accordance with the Zakat, Tax and Customs Authority (ZATCA) e-invoicing regulations, including the mandatory QR code, and are available on your order page.</li>
        </ul>
      </Section>
      <Section title="5. RFQs and bids">
        <p>An RFQ is an invitation to treat, not an offer. A bid is a binding offer by the supplier that remains valid until the bid validity date it specifies. Accepting a bid creates an order and a binding contract on the terms of the bid (price, quantities, lead time and validity). Buyers may cancel an order only while it is <strong>Pending</strong>; suppliers may not withdraw an accepted bid without the buyer’s consent.</p>
      </Section>
      <Section title="6. Payments">
        <p>We support cash on delivery, bank transfer and — where enabled — card payments (mada, Visa, Mastercard and Apple Pay) processed by Moyasar, a payment service provider licensed by the Saudi Central Bank (SAMA). Card details are entered on the provider’s secure form and are never stored by MySupplier. Bank-transfer orders are confirmed once funds are received with the order reference quoted.</p>
      </Section>
      <Section title="7. Delivery and acceptance">
        <p>Delivery terms, fees and lead times are set by the supplier and shown before you place an order. Inspect goods on delivery and record any shortage or damage on the delivery note. Claims must be raised within 48 hours of delivery through the order page or {COMPANY.supportEmail}. See our <Link href="/refund-policy" className="font-semibold text-brand-700 hover:underline">Refund &amp; Cancellation Policy</Link>.</p>
      </Section>
      <Section title="8. Acceptable use">
        <ul>
          <li>Do not publish false prices, misleading availability, or bids you cannot honour.</li>
          <li>Do not scrape, copy or resell Platform data without our written permission.</li>
          <li>Do not attempt to bypass the Platform to avoid fees on a transaction that originated here.</li>
          <li>Comply with all applicable laws, including the Saudi Anti-Commercial Fraud Law and E-Commerce Law.</li>
        </ul>
      </Section>
      <Section title="9. Fees">
        <p>Browsing prices and publishing RFQs is free for buyers. Suppliers may be charged a success fee or subscription as set out in their supplier agreement. Any fee is stated exclusive of VAT and invoiced separately.</p>
      </Section>
      <Section title="10. Liability">
        <p>We provide the Platform with reasonable skill and care but do not guarantee that prices, availability or delivery estimates are error-free. To the fullest extent permitted by law, our aggregate liability arising from any order is limited to the platform fees we received for that order. Nothing in these terms excludes liability that cannot be excluded under Saudi law.</p>
      </Section>
      <Section title="11. Governing law and disputes">
        <p>These terms are governed by the laws and regulations of the Kingdom of Saudi Arabia. Any dispute that cannot be resolved amicably within 30 days shall be referred to the competent courts or committees in Riyadh, without prejudice to any mandatory consumer-protection rights.</p>
      </Section>
      <Section title="12. Changes and contact">
        <p>We may update these terms; material changes are notified by email or in-app at least 14 days before they take effect. Questions: {COMPANY.legalEmail}.</p>
      </Section>
    </ProsePage>
  );
}
