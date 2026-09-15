import type { Metadata } from "next";
import Link from "next/link";
import { LegalNav, ProsePage } from "@/components/legal/Prose";

export const metadata: Metadata = {
  title: "Help & FAQ",
  description: "How MySupplier collects prices, how RFQ bidding works, VAT and ZATCA invoices, delivery, payments and becoming a supplier.",
};

interface Faq {
  q: string;
  a: React.ReactNode;
}

const GROUPS: Array<{ id: string; title: string; items: Faq[] }> = [
  {
    id: "prices",
    title: "How prices are collected",
    items: [
      {
        q: "Where do the prices on MySupplier come from?",
        a: (
          <>
            <p>Three labelled sources: <strong>Supplier</strong> prices published by verified suppliers from their dashboard or catalogue feed, <strong>Imported</strong> price lists we load on a supplier’s behalf, and <strong>Market</strong> reference prices aggregated from published sources. Only supplier and imported listings can be ordered; market prices are for benchmarking.</p>
          </>
        ),
      },
      { q: "How often are prices updated?", a: <p>Suppliers update prices in real time; automated feeds run daily. Every listing shows its last-updated date, and the price index on the home page tracks 30-day movement per category.</p> },
      { q: "Do prices include VAT and delivery?", a: <p>Listed prices exclude VAT unless stated. VAT at 15% and the supplier’s delivery fee for your city are added at checkout and shown before you confirm.</p> },
      { q: "What does the BOQ pricing tool do?", a: <p>Paste your bill of quantities and we match each line to catalogue items, price it against every supplier in your city and show the cheapest total, the best single supplier and where to buy each line. No sign-up needed; you can send the result as an RFQ in one click.</p> },
    ],
  },
  {
    id: "bidding",
    title: "How bidding works",
    items: [
      { q: "What is an RFQ?", a: <p>A request for quotation: your list of items, quantities, delivery city and date. Suppliers in your region are notified and submit itemised bids until the closing date you set.</p> },
      { q: "How do I compare and accept bids?", a: <p>Open the RFQ to see bids side by side — unit prices, total, lead time and validity. Accepting a bid creates an order, rejects the others and notifies the supplier. You can cancel the order while it is still Pending.</p> },
      { q: "Can a supplier change a bid?", a: <p>Yes, until the RFQ closes — re-submitting replaces the previous bid. Once accepted, a bid is binding for both sides.</p> },
      { q: "Do suppliers see each other’s bids?", a: <p>No. Suppliers see only their own bid; the buyer sees all bids.</p> },
    ],
  },
  {
    id: "vat",
    title: "VAT and invoices",
    items: [
      { q: "Is VAT charged?", a: <p>Yes — Saudi VAT at the statutory rate of 15% is added to every order and itemised on the invoice.</p> },
      { q: "Will I get a tax invoice?", a: <p>Every order has a simplified tax invoice compliant with ZATCA e-invoicing (phase 1), including the QR code, the seller’s VAT number and the VAT breakdown. Open it from the order page with <em>View invoice</em> and print or save it as PDF.</p> },
      { q: "Can I get an invoice in my company’s name?", a: <p>Invoices show the buyer name and company on your account. Update them on the Account page before ordering, or contact support to amend an issued invoice via credit note.</p> },
    ],
  },
  {
    id: "delivery",
    title: "Delivery",
    items: [
      { q: "Who delivers?", a: <p>The supplier you order from, using its own fleet or a contracted carrier. Lead times and delivery fees are shown per supplier before checkout.</p> },
      { q: "Can I track my order?", a: <p>Yes — the order page shows Pending → Confirmed → In transit → Delivered, and you receive an email and in-app notification at each step.</p> },
      { q: "What if goods arrive damaged or short?", a: <p>Note it on the delivery note and report within 48 hours from the order page. See the <Link href="/refund-policy" className="font-semibold text-brand-700 hover:underline">Refund &amp; Cancellation Policy</Link>.</p> },
    ],
  },
  {
    id: "payments",
    title: "Payments",
    items: [
      { q: "Which payment methods are available?", a: <p>Cash on delivery, bank transfer and — where enabled — card payments (mada, Visa, Mastercard, Apple Pay) processed securely by Moyasar. Card details never touch our servers.</p> },
      { q: "How do bank transfers work?", a: <p>Choose bank transfer at checkout; the bank details and your order reference appear on the order page and invoice. Quote the reference in the transfer so the supplier can confirm quickly.</p> },
      { q: "Can I pay by card later?", a: <p>Yes. Any unpaid card order has a <em>Pay now</em> button on its order page.</p> },
      { q: "When am I charged?", a: <p>Card payments are captured immediately when the payment succeeds; you will see a confirmation page and the order is marked Paid.</p> },
    ],
  },
  {
    id: "suppliers",
    title: "Becoming a supplier",
    items: [
      { q: "How do I list my products?", a: <p><Link href="/register?role=SUPPLIER" className="font-semibold text-brand-700 hover:underline">Register as a supplier</Link> with your CR number, then add prices one by one, upload a CSV or connect a catalogue feed from your dashboard.</p> },
      { q: "What does “Verified” mean?", a: <p>We checked the supplier’s Commercial Registration and VAT registration and confirmed its trading contact. Verified suppliers rank higher and can be filtered by buyers.</p> },
      { q: "What does it cost?", a: <p>Listing prices and receiving RFQs is free. Fees, if any, are set out in your supplier agreement and invoiced separately, exclusive of VAT.</p> },
    ],
  },
];

export default function HelpPage() {
  return (
    <ProsePage
      title="Help & FAQ"
      subtitle="Answers to the most common questions about prices, bidding, VAT, delivery, payments and selling on MySupplier."
      aside={
        <>
          <nav className="rounded-xl border border-slate-200 bg-white p-4 shadow-card" aria-label="FAQ sections">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">On this page</p>
            <ul className="space-y-1 text-sm">
              {GROUPS.map((g) => (
                <li key={g.id}>
                  <a href={`#${g.id}`} className="block rounded-lg px-2 py-1.5 text-slate-700 hover:bg-slate-50 hover:text-brand-700">{g.title}</a>
                </li>
              ))}
            </ul>
          </nav>
          <LegalNav />
        </>
      }
    >
      {GROUPS.map((g) => (
        <section key={g.id} id={g.id} className="mb-8 scroll-mt-24">
          <h2 className="mb-3 text-xl font-semibold text-slate-900">{g.title}</h2>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-card">
            {g.items.map((item) => (
              <details key={item.q} className="group px-5 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden>
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </summary>
                <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-600">{item.a}</div>
              </details>
            ))}
          </div>
        </section>
      ))}
      <p className="text-sm text-slate-500">
        Still stuck? <Link href="/contact" className="font-semibold text-brand-700 hover:underline">Contact support</Link>.
      </p>
    </ProsePage>
  );
}
