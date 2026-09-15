import type { Metadata } from "next";
import { COMPANY, LegalNav, ProsePage, Section } from "@/components/legal/Prose";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description: "Cancellations, returns and refunds for construction materials ordered through MySupplier.",
};

export default function RefundPolicyPage() {
  return (
    <ProsePage title="Refund & Cancellation Policy" subtitle="Clear rules for cancelling orders, reporting delivery issues and receiving refunds." updated="1 September 2026" aside={<LegalNav />}>
      <Section title="1. Cancelling an order">
        <ul>
          <li>You may cancel a <strong>Pending</strong> order free of charge from the order page.</li>
          <li>Once a supplier has <strong>Confirmed</strong> the order, cancellation requires the supplier’s agreement. Custom-cut steel, ready-mix concrete and made-to-order items cannot be cancelled after confirmation.</li>
          <li>Orders that are <strong>In transit</strong> cannot be cancelled; refuse the delivery only if the goods are damaged or do not match the order.</li>
        </ul>
      </Section>
      <Section title="2. Delivery issues">
        <p>Inspect the goods on arrival and note any shortage, damage or specification mismatch on the delivery note before signing. Report the issue within <strong>48 hours</strong> from the order page or by emailing {COMPANY.supportEmail} with photos and the order reference. The supplier must respond within 2 business days with a replacement, partial credit or collection.</p>
      </Section>
      <Section title="3. Returns">
        <p>Standard stock items in original, resalable packaging may be returned within 7 days of delivery subject to the supplier’s approval and a restocking fee of up to 15%. Perishable or time-sensitive materials (cement, mortar, ready-mix, adhesives past their storage window) and cut-to-size items are non-returnable unless defective.</p>
      </Section>
      <Section title="4. Refunds">
        <ul>
          <li><strong>Card payments</strong> are refunded to the original card through Moyasar within 5–10 business days of approval, depending on your bank.</li>
          <li><strong>Bank transfers</strong> are refunded to the originating IBAN within 5 business days of approval.</li>
          <li><strong>Cash on delivery</strong> orders that are refused at the door incur no charge; partial refunds are paid by bank transfer.</li>
          <li>VAT is refunded proportionally and a credit note referencing the original tax invoice is issued in accordance with ZATCA rules.</li>
        </ul>
      </Section>
      <Section title="5. Awarded RFQ orders">
        <p>Orders created by accepting a bid are governed by the bid’s stated terms (validity, lead time and delivery conditions). Where the bid is silent, this policy applies.</p>
      </Section>
      <Section title="6. Disputes">
        <p>If you and the supplier cannot agree, escalate to MySupplier support. We review the order record, delivery notes and photos and issue a written decision within 10 business days. Our decision does not limit your rights under Saudi consumer-protection and commercial law.</p>
      </Section>
    </ProsePage>
  );
}
