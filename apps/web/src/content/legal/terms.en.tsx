import Link from "next/link";
import { LEGAL_PATHS, SUPPLIER_FEES } from "@mysupplier/shared";
import { LegalNav, ProsePage, Section } from "@/components/legal/Prose";
import { COMPANY } from "@/components/legal/company";

export function TermsEn() {
  return (
    <ProsePage doc="TERMS" title="Terms & Conditions" subtitle="These terms govern access to and use of the MySupplier marketplace for construction materials in the Kingdom of Saudi Arabia, and every order placed through it." aside={<LegalNav />}>
      <Section id="definitions" title="1. Definitions">
        <ul>
          <li><strong>“MySupplier”, “we”, “us”</strong>: {COMPANY.legalName}, Commercial Registration {COMPANY.crNumber}, VAT registration {COMPANY.vatNumber}, registered office at {COMPANY.address}.</li>
          <li><strong>“Platform”</strong>: the website, mobile applications, APIs and related services operated by MySupplier.</li>
          <li><strong>“Buyer”</strong>: a business user that browses prices, publishes RFQs or places orders. <strong>“Supplier”</strong>: a business user that lists materials, submits bids and fulfils orders under the <Link href={LEGAL_PATHS.SUPPLIER_AGREEMENT}>Supplier Agreement</Link>. <strong>“User”</strong>: any Buyer or Supplier.</li>
          <li><strong>“MySupplier Direct”</strong>: the house supplier operated by MySupplier that sells selected materials in its own name during the launch phase (Phase 0).</li>
          <li><strong>“Listing”</strong>: a Supplier’s published price for a material in a city, with its minimum quantity, lead time and validity date. <strong>“RFQ”</strong>: a request for quotation; <strong>“Bid”</strong>: a Supplier’s itemised offer in response to an RFQ. <strong>“Order”</strong>: a direct shop order or an order created by awarding a Bid.</li>
          <li><strong>“Business Day”</strong>: Sunday to Thursday, excluding official public holidays in the Kingdom.</li>
        </ul>
      </Section>
      <Section id="eligibility" title="2. Eligibility">
        <p>The Platform is a business-to-business service. You may register only if you act in the course of a trade, business or profession and you are authorised to bind the entity you represent. Every company account must hold a valid Commercial Registration (CR) and, where registration is required by law, a valid VAT registration number. We may request supporting documents and refuse, suspend or close accounts that cannot be verified. Consumers (natural persons buying for private use) are not eligible.</p>
      </Section>
      <Section id="accounts" title="3. Accounts and security">
        <p>You must provide accurate, complete information and keep it current. You are responsible for your login credentials and for all activity under your account, including the actions of team members you invite. Notify us without delay at {COMPANY.supportEmail} if you suspect unauthorised use. We may require phone verification by one-time code and may apply role-based permissions within a company account.</p>
      </Section>
      <Section id="role" title="4. MySupplier’s role">
        <p>MySupplier operates the Platform and acts as an intermediary that brings Buyers and Suppliers together. Unless the invoice names MySupplier as seller, each Order forms a contract of sale between the Buyer and the Supplier named on the Order; MySupplier is not a party to that contract and does not own, store or transport the goods. Where payment is collected through the Platform, MySupplier acts as commercial agent for collection on behalf of the Supplier.</p>
        <p><strong>MySupplier Direct.</strong> During Phase 0 the house supplier “MySupplier Direct” sells selected materials in MySupplier’s own name. For those Orders MySupplier is the seller, issues the tax invoice and bears the seller’s obligations under these Terms and the Returns Policy.</p>
      </Section>
      <Section id="listings" title="5. Listings and price validity">
        <p>Listings are published by Suppliers, who are solely responsible for their accuracy. A Listing is an invitation to order, not a binding offer. Prices are valid until the validity date shown or, where none is shown, until the Supplier updates or withdraws the Listing; Listings not refreshed for more than {SUPPLIER_FEES.listingRefreshDays} days may be hidden. Market and reference prices are indicative only and cannot be ordered.</p>
      </Section>
      <Section id="orders" title="6. Orders and contract formation">
        <p>An Order placed through the shop is an offer by the Buyer. A contract is formed when the Supplier confirms the Order (status <strong>Confirmed</strong>) or begins performance, whichever is earlier; until then either party may cancel without charge. The confirmed price, quantities, lead time and delivery terms are fixed for that Order. Minimum order quantities, delivery fees and cut-off times shown at checkout form part of the contract.</p>
      </Section>
      <Section id="rfqs" title="7. RFQs and bids">
        <p>An RFQ is an invitation to treat. A Bid is a binding offer by the Supplier that remains open until its stated validity date. Awarding a Bid creates an Order on the Bid’s terms and a binding contract between Buyer and Supplier. Suppliers may not withdraw an awarded Bid without the Buyer’s consent; Buyers must not use RFQs to obtain prices they do not intend to act on.</p>
      </Section>
      <Section id="prices" title="8. Prices, VAT and e-invoices">
        <ul>
          <li>All prices are in Saudi Riyals (SAR) and, unless clearly marked otherwise, exclude value added tax. VAT at the statutory rate (currently <strong>15%</strong>) is added at checkout and itemised on the invoice.</li>
          <li>Tax invoices and credit notes are issued electronically in accordance with the Zakat, Tax and Customs Authority (ZATCA) e-invoicing regulations (Fatoora), including the mandatory QR code, and are available on the Order page.</li>
          <li>Obvious pricing errors may be corrected before confirmation; the Buyer may cancel free of charge if the corrected price is not acceptable.</li>
        </ul>
      </Section>
      <Section id="payment" title="9. Payment">
        <p>Depending on the Supplier and the Buyer’s standing, the following methods are offered: <strong>cash on delivery</strong>; <strong>bank transfer</strong> to the account shown on the pro-forma, quoting the Order reference; <strong>card and wallet payments</strong> (mada, Visa, Mastercard, Apple Pay and STC Pay) processed by Moyasar, a payment service provider licensed by the Saudi Central Bank; and <strong>credit terms</strong> (net terms) where approved by MySupplier, subject to the credit limit and due dates shown on the Order. Card details are entered on the provider’s secure form and are never stored by MySupplier. Overdue credit balances may be charged the administrative fee stated in the credit approval and lead to suspension of credit.</p>
      </Section>
      <Section id="delivery" title="10. Delivery, risk and title">
        <p>Delivery dates and fees are set by the Supplier and shown before the Order is placed; dates are estimates made in good faith. The Buyer must provide safe site access and a person authorised to receive the goods. <strong>Risk</strong> in the goods passes to the Buyer when the delivery note is signed (or when delivery is refused without a valid reason). <strong>Title</strong> passes to the Buyer only on receipt of full payment of the price and VAT; until then the Supplier may require the goods to be stored identifiably and returned on demand if payment is not made.</p>
      </Section>
      <Section id="inspection" title="11. Inspection and claims">
        <p>The Buyer must inspect the goods on delivery, record any shortage, visible damage or specification mismatch on the delivery note before signing, and report the claim with photographs through the Order page within <strong>48 hours</strong> of delivery. Claims not raised within that period are deemed waived for visible defects. Hidden defects must be reported within 7 days of discovery and in any event within the manufacturer’s warranty period.</p>
      </Section>
      <Section id="returns" title="12. Returns and refunds">
        <p>Returns, cancellations and refunds are governed by the <Link href={LEGAL_PATHS.RETURNS_POLICY}>Returns & Refund Policy for Building Materials</Link>, which forms part of these Terms. In summary: perishable and bulk materials are non-returnable once delivered; most other stock items may be returned within 7 days in resalable condition subject to a restocking fee; damage, shortage and wrong-item claims are resolved at the Supplier’s cost.</p>
      </Section>
      <Section id="fees" title="13. Platform fees">
        <p>Browsing prices, publishing RFQs and placing Orders is free for Buyers. Suppliers pay the success fee and payment-processing fees set out in the <Link href={LEGAL_PATHS.SUPPLIER_AGREEMENT}>Supplier Agreement</Link> (currently {SUPPLIER_FEES.successFeePct}% of the order value excluding VAT). Fees are stated exclusive of VAT and invoiced to the Supplier.</p>
      </Section>
      <Section id="ip" title="14. Intellectual property and data use">
        <p>The Platform, its software, databases, price indices, trademarks and content are owned by MySupplier or its licensors. You receive a limited, revocable, non-exclusive licence to use the Platform for its intended business purpose. You may not scrape, copy, resell or redistribute Platform data, nor build a competing database from it, without our written consent. By submitting Listings, logos, product data and reviews you grant MySupplier a worldwide, royalty-free licence to display and process them to operate and promote the Platform, including in aggregated and anonymised price statistics.</p>
      </Section>
      <Section id="pdpl" title="15. Personal data">
        <p>We process personal data in accordance with the Saudi Personal Data Protection Law (PDPL) and its Implementing Regulations, as described in our <Link href={LEGAL_PATHS.PRIVACY}>Privacy Policy</Link>. Users who receive personal data of other Users through the Platform (for example, delivery contacts) may use it only to perform the relevant Order and must protect it in accordance with the PDPL.</p>
      </Section>
      <Section id="conduct" title="16. Prohibited conduct and non-circumvention">
        <ul>
          <li>Publishing false prices, misleading availability, counterfeit or non-compliant goods, or Bids you cannot honour.</li>
          <li>Manipulating reviews, ratings or price indices; creating multiple accounts to evade suspension.</li>
          <li>Circumventing the Platform: diverting an Order, Buyer relationship or RFQ that originated on the Platform to an off-platform transaction in order to avoid fees. Fees remain payable on such transactions for 12 months after first contact.</li>
          <li>Interfering with the security or operation of the Platform, or using it for any unlawful purpose, including breach of the Saudi Anti-Commercial Fraud Law, the E-Commerce Law or the Anti-Cyber Crime Law.</li>
        </ul>
      </Section>
      <Section id="suspension" title="17. Suspension and termination">
        <p>We may suspend or restrict an account, remove Listings or cancel pending Orders where we reasonably suspect a breach of these Terms, fraud, non-payment or a legal requirement. You may close your account at any time from the Account page; Orders in progress, outstanding payments and accrued fees survive closure. We will give reasonable notice of suspension unless doing so would prejudice an investigation or legal obligation.</p>
      </Section>
      <Section id="liability" title="18. Warranties and liability">
        <p>Suppliers warrant that goods conform to their description, applicable Saudi standards (SASO/SABER) and the specifications on the Order. MySupplier provides the Platform with reasonable skill and care but does not warrant that it will be uninterrupted or error-free, nor does it warrant the prices, availability, quality or delivery performance of third-party Suppliers.</p>
        <p>To the fullest extent permitted by law: MySupplier is not liable for indirect or consequential loss, loss of profit, project delay or liquidated damages under the Buyer’s contracts; MySupplier’s aggregate liability to a User in connection with an Order is limited to the platform fees received for that Order, and for MySupplier Direct Orders to the price paid for the goods concerned; and nothing in these Terms excludes liability for fraud, gross negligence, death or personal injury, or any liability that cannot be excluded under Saudi law.</p>
      </Section>
      <Section id="force-majeure" title="19. Force majeure">
        <p>Neither party is liable for delay or failure caused by events beyond its reasonable control, including governmental action, port or customs closures, severe weather, strikes, epidemics or failures of public infrastructure. Delivery dates are extended by the period of the event; if it continues for more than 30 days either party may cancel the affected Order without liability.</p>
      </Section>
      <Section id="notices" title="20. Notices">
        <p>Notices to Users are given by email to the registered address, by in-app notification or by SMS/WhatsApp to the verified phone number, and are deemed received on the next Business Day. Notices to MySupplier are sent to {COMPANY.legalEmail} or to the registered office address.</p>
      </Section>
      <Section id="law" title="21. Governing law and disputes">
        <p>These Terms and every Order are governed by the laws and regulations of the Kingdom of Saudi Arabia, including the E-Commerce Law (Royal Decree M/126) and its Implementing Regulations. The parties shall first attempt to resolve disputes amicably through MySupplier’s dispute process (see the Returns Policy). Any dispute not resolved within 30 days shall be referred to the competent courts or committees in Riyadh, without prejudice to any mandatory rights of the parties.</p>
      </Section>
      <Section id="changes" title="22. Changes to these Terms">
        <p>We may amend these Terms. Material changes are notified by email or in-app at least 14 days before they take effect and are published with a new version number at the top of this page. Continued use after the effective date, or clicking “Accept” when prompted, constitutes acceptance. Orders placed before the effective date remain subject to the Terms in force when they were placed.</p>
      </Section>
      <Section id="contact" title="23. Contact">
        <p>{COMPANY.legalName} · {COMPANY.address} · {COMPANY.supportEmail} · {COMPANY.phone} · {COMPANY.hours}. Legal notices: {COMPANY.legalEmail}.</p>
      </Section>
    </ProsePage>
  );
}
