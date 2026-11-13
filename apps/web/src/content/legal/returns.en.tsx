import Link from "next/link";
import { FAULT_CLAIM_HOURS, LEGAL_PATHS, SUPPLIER_FEES } from "@mysupplier/shared";
import { LegalNav, ProsePage, Section } from "@/components/legal/Prose";
import { ReturnsPolicyTable } from "@/components/legal/ReturnsPolicyTable";
import { COMPANY } from "@/components/legal/company";

export function ReturnsEn() {
  return (
    <ProsePage doc="RETURNS_POLICY" title="Returns & Refund Policy for Building Materials" subtitle="What can be returned, within how long, at what cost, and how refunds are paid. This policy forms part of the Terms & Conditions and is applied automatically when you request a return." aside={<LegalNav />}>
      <Section id="scope" title="1. Scope and principles">
        <p>This policy applies to every Order placed through MySupplier, whether fulfilled by a third-party Supplier or by MySupplier Direct. Building materials are heavy, moisture-sensitive and often batch-specific, so return rights depend on the material family. Two rules apply throughout:</p>
        <ul>
          <li><strong>Supplier fault</strong> (damage, shortage, defect, wrong item or specification mismatch) is always remedied at the Supplier’s cost — by replacement, collection and refund, or credit note — provided it is reported within <strong>{FAULT_CLAIM_HOURS} hours</strong> of delivery.</li>
          <li><strong>Change of mind</strong> (over-ordering, project changes, cancelled works) is accepted only for the material families marked returnable below, within the stated window, in resalable condition, and subject to the restocking fee and return transport.</li>
        </ul>
      </Section>
      <Section id="table" title="2. Returns schedule by material family">
        <p>The Platform looks up the row for each order line from the product category and enforces it when the return request is submitted.</p>
        <ReturnsPolicyTable lang="en" />
        <p className="text-xs text-slate-500">Cut-to-size, custom-fabricated, made-to-order and special-order imported items are non-returnable in every family. Tinted or mixed paint, opened containers, broken pallets, partial packs and cut cable lengths are never accepted.</p>
      </Section>
      <Section id="damage" title="3. Damage, shortage and wrong item on delivery">
        <ol>
          <li>Inspect the goods before signing. Count pallets, bundles and boxes, and check the grade, size and batch against the Order.</li>
          <li>Write any shortage, damage or mismatch on the delivery note (paper or electronic) and have the driver countersign it.</li>
          <li>Open a return from the Order page within {FAULT_CLAIM_HOURS} hours, choosing the reason <em>Damaged</em>, <em>Defective</em>, <em>Wrong item</em> or <em>Not as described</em>, and attach photographs showing the labels and the fault.</li>
          <li>The Supplier must respond within {SUPPLIER_FEES.claimResponseBusinessDays} business days with a replacement delivery, collection and refund, or a credit note. No restocking fee applies and the Supplier bears all transport.</li>
        </ol>
        <p>Goods refused at the door for a valid reason are returned on the same vehicle at no charge. Shortages tipped from bulk vehicles (aggregates, sand, ready-mix) can only be claimed when noted on the delivery note at the time of delivery.</p>
      </Section>
      <Section id="change-of-mind" title="4. Change-of-mind returns">
        <ul>
          <li>Request the return from the Order page within the window shown for the material family. The Supplier approves or declines within {SUPPLIER_FEES.claimResponseBusinessDays} business days; approval may be refused where the goods are no longer in a resalable condition.</li>
          <li>The <strong>Buyer</strong> arranges and pays for the return transport to the Supplier’s branch, or asks the Supplier to collect at the quoted collection fee. Goods travel at the Buyer’s risk until received.</li>
          <li>The Supplier inspects the goods on receipt. Only units that meet the conditions in the table are accepted; rejected units are held for 5 business days for the Buyer to collect.</li>
          <li>The <strong>restocking fee</strong> shown in the table is deducted from the goods value of the accepted units; VAT is refunded on the net amount. The original delivery fee is not refunded.</li>
        </ul>
      </Section>
      <Section id="refunds" title="5. Refund methods and timing">
        <ul>
          <li><strong>Card, mada, Apple Pay and STC Pay</strong>: refunded to the original payment method through Moyasar within 5–10 business days of the refund being recorded, depending on the issuing bank.</li>
          <li><strong>Bank transfer</strong>: refunded to the originating IBAN within 5 business days.</li>
          <li><strong>Cash on delivery</strong>: refunded by bank transfer to the IBAN the Buyer provides, within 5 business days; cash is not returned by drivers.</li>
          <li><strong>Credit terms</strong>: the credit note is applied to the outstanding balance and the available credit limit is restored.</li>
          <li>Every refund is documented by an electronic <strong>credit note</strong> referencing the original tax invoice, issued in accordance with ZATCA e-invoicing rules, with VAT adjusted proportionally.</li>
        </ul>
      </Section>
      <Section id="direct" title="6. MySupplier Direct">
        <p>For Orders sold by MySupplier Direct, claims reported within {FAULT_CLAIM_HOURS} hours are collected on the <strong>next business day</strong> in Riyadh and refunded or replaced within 3 business days of collection. Change-of-mind returns follow the schedule above; collection in Riyadh is offered at the fee quoted at the time of the request.</p>
      </Section>
      <Section id="cancellation" title="7. Cancelling an order">
        <ul>
          <li><strong>Pending</strong> orders (not yet confirmed by the Supplier) may be cancelled free of charge from the Order page; prepaid amounts are refunded in full.</li>
          <li><strong>Confirmed</strong> orders may be cancelled only with the Supplier’s consent. Ready-mix concrete, cut-to-size steel, tinted paint and made-to-order items cannot be cancelled once production or cutting has started.</li>
          <li><strong>In-transit</strong> orders cannot be cancelled. Refuse the delivery only for a valid supplier-fault reason; unjustified refusal of a delivered vehicle may incur the return transport and, for perishable or bulk materials, the full price.</li>
          <li>Orders awarded from an RFQ follow the cancellation terms stated in the Bid; where the Bid is silent, this policy applies.</li>
        </ul>
      </Section>
      <Section id="disputes" title="8. Dispute escalation">
        <p>If the Buyer and the Supplier cannot agree within {SUPPLIER_FEES.claimResponseBusinessDays} business days of the return request, either party may escalate from the return page or by emailing {COMPANY.supportEmail}. MySupplier reviews the Order record, delivery note, photographs and messages, may request an independent inspection, and issues a written decision within <strong>10 business days</strong>. Both parties agree to implement the decision; it does not limit their rights under the Saudi E-Commerce Law and Commercial Courts Law.</p>
      </Section>
      <Section id="related" title="9. Related documents">
        <p>This policy should be read with the <Link href={LEGAL_PATHS.TERMS}>Terms & Conditions</Link> (delivery, risk and inspection) and, for Suppliers, the <Link href={LEGAL_PATHS.SUPPLIER_AGREEMENT}>Supplier Agreement</Link> (returns and claims obligations). Questions: {COMPANY.supportEmail} · {COMPANY.phone}.</p>
      </Section>
    </ProsePage>
  );
}
