import Link from "next/link";
import { LEGAL_PATHS, SUPPLIER_FEES } from "@mysupplier/shared";
import { LegalNav, LegalTable, ProsePage, Section } from "@/components/legal/Prose";
import { COMPANY } from "@/components/legal/company";

export function SupplierAgreementEn() {
  const F = SUPPLIER_FEES;
  return (
    <ProsePage doc="SUPPLIER_AGREEMENT" title="Supplier Agreement" subtitle="The agreement between MySupplier and every company that lists and sells building materials on the Platform. It is accepted electronically by the company’s authorised signatory." aside={<LegalNav />}>
      <Section id="parties" title="1. Parties and acceptance">
        <p>This Agreement is made between <strong>{COMPANY.legalName}</strong> (CR {COMPANY.crNumber}, {COMPANY.address}) (“MySupplier”) and the company identified in the supplier account (the “Supplier”). It is accepted when a person with the <strong>Owner</strong> role on the Supplier’s account, acting as its authorised signatory, ticks the acceptance box and clicks “Accept”. That click constitutes the Supplier’s electronic signature under the Saudi Electronic Transactions Law; MySupplier records the document version, the signatory, the time, IP address and device. The <Link href={LEGAL_PATHS.TERMS}>Terms & Conditions</Link>, the <Link href={LEGAL_PATHS.RETURNS_POLICY}>Returns & Refund Policy</Link> and the <Link href={LEGAL_PATHS.PRIVACY}>Privacy Policy</Link> are incorporated by reference; in case of conflict this Agreement prevails for the matters it regulates.</p>
      </Section>
      <Section id="definitions" title="2. Definitions">
        <p>Capitalised terms have the meaning given in the Terms & Conditions. In addition: <strong>“Order Value”</strong> means the goods value of a confirmed Order excluding VAT and delivery fees; <strong>“Platform-Originated Buyer”</strong> means a Buyer whose first contact with the Supplier took place through the Platform (RFQ, Bid, Order, message or price request); <strong>“Payout”</strong> means the transfer of collected Order proceeds, net of fees, to the Supplier’s registered IBAN.</p>
      </Section>
      <Section id="eligibility" title="3. Eligibility and verification">
        <p>To be marked <strong>Verified</strong> and to receive Payouts the Supplier must upload and keep current: a valid Commercial Registration, a VAT registration certificate, an IBAN certificate in the company’s name, and the details of an authorised contact person with a verified Saudi mobile number. MySupplier verifies these against official sources (Wathq, ZATCA) and may request further evidence such as SASO/SABER certificates, agency letters or manufacturer authorisations. Verification is <strong>renewed yearly</strong> and whenever a document expires; unverified Suppliers may be hidden from Buyers.</p>
      </Section>
      <Section id="listings" title="4. Listings">
        <ul>
          <li>Every Listing must state an accurate price, its validity date, available stock (or “on request”), minimum quantity and lead time per city. Prices must be <strong>updated at least every {F.listingRefreshDays} days</strong>; Listings older than that are hidden from Buyers until refreshed.</li>
          <li>The Supplier warrants that goods are genuine, new unless stated otherwise, and compliant with Saudi standards and conformity regulations (SASO / SABER). Counterfeit, grey-import or non-compliant goods are prohibited.</li>
          <li>Mill certificates, test reports, technical data sheets and safety data sheets must be provided on request within 1 business day.</li>
          <li>Product data, images and brand names uploaded by the Supplier must not infringe third-party rights; the Supplier grants MySupplier the licence described in the Terms.</li>
        </ul>
      </Section>
      <Section id="sla" title="5. Order handling service levels">
        <ul>
          <li><strong>Confirmation:</strong> confirm or decline every Order within {F.confirmWithinHours} business hour during working hours and in no case later than {F.confirmHardLimitHours} hours after it is placed. Unconfirmed Orders may be cancelled and re-routed.</li>
          <li><strong>Delivery:</strong> deliver on the promised date, within the delivery window shown at checkout, with a competent driver and unloading arrangements agreed with the Buyer. Delays must be notified through the Order page before the promised date.</li>
          <li><strong>Documents:</strong> obtain a signed delivery note (paper or electronic) for every delivery and upload it; issue a ZATCA-compliant tax invoice (Phase 2 integrated where required) for every Order not invoiced by MySupplier.</li>
          <li><strong>Communication:</strong> answer Buyer messages and price requests within 1 business day.</li>
        </ul>
      </Section>
      <Section id="quality" title="6. Quality, safety and compliance">
        <p>The Supplier is responsible for the quality, packaging, labelling and safe loading of the goods and for compliance with the Saudi Building Code, the Anti-Commercial Fraud Law, the E-Commerce Law, VAT and e-invoicing regulations, labour and transport regulations. Hazardous goods (chemicals, gas, solvents) must be shipped with safety data sheets and in compliance with transport rules.</p>
      </Section>
      <Section id="fees" title="7. Pricing, fees and payouts">
        <LegalTable
          head={["Item", "Rate", "Notes"]}
          rows={[
            ["Platform success fee", <span key="a" dir="ltr">{F.successFeePct}% of Order Value</span>, "Charged on every confirmed Order that is delivered or cancelled by the Supplier’s fault; excl. VAT. MySupplier may agree a different rate in writing per company."],
            ["Card / wallet processing", <span key="b" dir="ltr">{F.cardProcessingPct}% of amount charged</span>, "Passed through at cost for mada, Visa, Mastercard, Apple Pay and STC Pay payments collected through the Platform."],
            ["Payout timing", <span key="c" dir="ltr">T+{F.payoutDays} days</span>, "After confirmed delivery (signed delivery note), net of fees and approved refunds, to the registered IBAN."],
            ["Fee statement", "Monthly", "Tax invoice from MySupplier for the month’s fees plus 15% VAT, downloadable from the finance page."],
          ]}
        />
        <ul>
          <li>Where the Buyer pays by card, wallet or bank transfer to the Platform, MySupplier collects the payment <strong>as commercial agent on behalf of the Supplier</strong> and holds it until Payout. Cash-on-delivery proceeds are collected by the Supplier, which then owes MySupplier the fees, settled by offset against other Payouts or by the monthly statement.</li>
          <li>Payouts are suspended for Orders with an open return or dispute, and fees are refunded pro rata where an Order is refunded for a reason that is not the Supplier’s fault.</li>
          <li>The Supplier shall not charge Buyers a higher price on the Platform than it offers off-platform for the same goods, quantity and delivery conditions.</li>
        </ul>
      </Section>
      <Section id="returns" title="8. Returns and claims">
        <p>The Supplier shall apply the <Link href={LEGAL_PATHS.RETURNS_POLICY}>Returns & Refund Policy</Link>, respond to every return request or claim within <strong>{F.claimResponseBusinessDays} business days</strong>, bear the cost of replacement, collection and refund for supplier-fault claims, inspect returned goods promptly on receipt and record the outcome on the Platform. Refunds approved under the Policy may be deducted from Payouts.</p>
      </Section>
      <Section id="performance" title="9. Performance and ratings">
        <p>MySupplier measures confirmation time, on-time delivery rate, cancellation rate, claim rate and Buyer ratings, and displays some of these to Buyers. Indicatively: an on-time delivery rate below 90%, a Supplier-caused cancellation rate above 5% or an average rating below 3.5 over any 30-day window triggers a <strong>written warning</strong>; failure to recover within the following 30 days, or repeated breaches, may lead to <strong>suspension</strong> of Listings. MySupplier may remove reviews that breach its content rules but will not alter genuine ratings.</p>
      </Section>
      <Section id="data" title="10. Buyer data and confidentiality">
        <p>Buyer names, contact details, delivery addresses, RFQ contents and order histories received through the Platform are confidential and personal data under the PDPL. The Supplier may use them solely to perform Orders and respond to RFQs, must protect them with appropriate measures, must not sell, share or use them for unsolicited marketing, and must delete them when no longer needed for the Order, tax and warranty obligations. Each party keeps the other’s non-public commercial information confidential during the term and for 3 years after.</p>
      </Section>
      <Section id="non-circumvention" title="11. Non-circumvention">
        <p>For <strong>{F.nonCircumventionMonths} months</strong> after first contact with a Platform-Originated Buyer, the Supplier shall not solicit or accept orders from that Buyer for goods of the kind listed on the Platform outside the Platform in order to avoid fees. If it does, the platform success fee remains payable on the off-platform order value, and MySupplier may invoice it on the basis of the Supplier’s records, which the Supplier shall make available on request.</p>
      </Section>
      <Section id="ip" title="12. Intellectual property and brand use">
        <p>Each party retains its intellectual property. The Supplier may describe itself as a “MySupplier verified supplier” and use the badge supplied by MySupplier while this Agreement is in force and the verification is valid. MySupplier may use the Supplier’s name and logo to identify it on the Platform and in marketing of the Platform.</p>
      </Section>
      <Section id="warranties" title="13. Representations, indemnity and insurance">
        <p>The Supplier represents that it is duly registered and licensed, that the signatory is authorised, that its goods and Listings comply with this Agreement, and that it holds the insurance customary for its trade (at least goods-in-transit and public liability cover). The Supplier shall indemnify MySupplier against third-party claims, fines and costs arising from the Supplier’s goods, Listings, deliveries or breach of law or this Agreement.</p>
      </Section>
      <Section id="liability" title="14. Liability">
        <p>MySupplier’s aggregate liability to the Supplier under this Agreement in any 12-month period is limited to the fees paid by the Supplier in that period. Neither party is liable for indirect or consequential loss or loss of profit. Nothing limits liability for fraud, wilful misconduct, the indemnity in clause 13 or any liability that cannot be limited under Saudi law.</p>
      </Section>
      <Section id="term" title="15. Term, suspension and termination">
        <ul>
          <li>This Agreement starts on acceptance and continues until terminated. Either party may terminate for convenience on <strong>{F.terminationNoticeDays} days’</strong> written notice.</li>
          <li>MySupplier may suspend Listings or Payouts immediately, or terminate with immediate effect, for material breach (including counterfeit goods, fraud, non-circumvention breaches, repeated SLA failures, lapsed registration or non-payment of fees).</li>
          <li>On termination the Supplier completes confirmed Orders, open returns are settled under the Returns Policy, accrued fees fall due, and final Payout is made after the last Order’s return window closes. Clauses 10, 11, 13, 14 and 16 survive termination.</li>
        </ul>
      </Section>
      <Section id="law" title="16. Governing law and disputes">
        <p>This Agreement is governed by the laws of the Kingdom of Saudi Arabia. Disputes are first escalated to the parties’ account managers for 30 days of good-faith negotiation and thereafter referred to the Commercial Court in Riyadh.</p>
      </Section>
      <Section id="notices" title="17. Notices">
        <p>Notices are given in writing by email to the Supplier’s registered owner address and to {COMPANY.legalEmail}, or by in-app notification to the Owner account, and are deemed received on the next Business Day.</p>
      </Section>
      <Section id="entire" title="18. Entire agreement and changes">
        <p>This Agreement, with the documents it incorporates, is the entire agreement between the parties regarding the Platform and supersedes prior proposals. MySupplier may amend it on 30 days’ notice; the Owner will be asked to accept the new version and may terminate instead. Fee changes never apply to Orders confirmed before the effective date.</p>
      </Section>
      <Section id="language" title="19. Language">
        <p>This Agreement is published in Arabic and English. <strong>In case of any conflict or inconsistency, the Arabic version prevails.</strong></p>
      </Section>
    </ProsePage>
  );
}
