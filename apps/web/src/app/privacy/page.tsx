import type { Metadata } from "next";
import { COMPANY, LegalNav, ProsePage, Section } from "@/components/legal/Prose";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How MySupplier collects, uses and protects personal data under the Saudi Personal Data Protection Law (PDPL).",
};

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy Policy" subtitle="How we collect, use and protect your data — in line with the Saudi Personal Data Protection Law (PDPL)." updated="1 September 2026" aside={<LegalNav />}>
      <Section title="1. Data controller">
        <p>{COMPANY.legalName}, {COMPANY.address}, is the controller of personal data processed on MySupplier. Contact our data protection officer at {COMPANY.privacyEmail}.</p>
      </Section>
      <Section title="2. What we collect">
        <ul>
          <li><strong>Account data:</strong> name, work email, phone number, role, preferred language, password (stored hashed).</li>
          <li><strong>Company data:</strong> company name, CR number, VAT number, city, contact details, verification status.</li>
          <li><strong>Transaction data:</strong> RFQs, bids, orders, delivery addresses, invoices and payment status. Card numbers are processed by our payment provider and are never stored on our systems.</li>
          <li><strong>Technical data:</strong> IP address, device and browser information, pages visited and error logs, used to keep the service secure and reliable.</li>
          <li><strong>Communications:</strong> support requests, notifications you receive and push-notification tokens for devices you register.</li>
        </ul>
      </Section>
      <Section title="3. Why we process it">
        <ul>
          <li>To operate the marketplace: matching RFQs with suppliers, processing orders and issuing ZATCA-compliant tax invoices (performance of a contract).</li>
          <li>To verify suppliers’ CR and VAT registration and prevent fraud (legitimate interest and legal obligation).</li>
          <li>To send transactional notifications about bids, orders and payments by email, push or in-app (performance of a contract). Marketing messages are sent only with your consent and can be stopped at any time.</li>
          <li>To meet accounting, tax and anti-fraud obligations under Saudi law (legal obligation). Invoices are retained for the statutory period.</li>
        </ul>
      </Section>
      <Section title="4. Who sees your data">
        <p>Buyers see the company profile of suppliers who bid; suppliers see the RFQ and delivery details of buyers who publish them. We share data with processors who help us run the service — cloud hosting, email and push-notification delivery, and our payment service provider — under contracts that restrict their use of the data. We do not sell personal data.</p>
        <p>Where data is processed outside the Kingdom we apply the safeguards required by the PDPL and its implementing regulations.</p>
      </Section>
      <Section title="5. Cookies and local storage">
        <p>We use strictly necessary browser storage for your session token, language preference and shopping cart. We do not use advertising cookies. Optional analytics run only after you accept the consent banner; you can change your choice by clearing site data in your browser.</p>
      </Section>
      <Section title="6. Retention">
        <p>Account data is kept while your account is active and for 12 months after closure. Orders, invoices and payment records are retained for the period required by ZATCA and the Saudi Commercial Law (currently 10 years). Logs are retained for up to 12 months.</p>
      </Section>
      <Section title="7. Your rights">
        <p>Under the PDPL you may request access to, correction of, or deletion of your personal data, object to certain processing, and withdraw consent. You can edit your profile and delete your account from the Account page; other requests can be sent to {COMPANY.privacyEmail}. We respond within 30 days. You may also lodge a complaint with the Saudi Data &amp; AI Authority (SDAIA).</p>
      </Section>
      <Section title="8. Security">
        <p>Data is encrypted in transit (TLS) and at rest, access is role-based and logged, passwords are hashed, and card payments are handled by a PCI-DSS Level 1 provider. No system is perfectly secure; please use a strong, unique password.</p>
      </Section>
      <Section title="9. Changes">
        <p>We will notify you of material changes by email or in-app before they take effect. Continued use after the effective date means you accept the updated policy.</p>
      </Section>
    </ProsePage>
  );
}
