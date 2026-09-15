import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY, LegalNav, ProsePage } from "@/components/legal/Prose";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with MySupplier support — orders, payments, invoices and supplier onboarding.",
};

export default function ContactPage() {
  const whatsappHref = `https://wa.me/${COMPANY.whatsapp.replace(/[^\d]/g, "")}`;
  return (
    <ProsePage
      title="Contact us"
      subtitle="We answer within one business day. For an open order, include the order reference so we can help faster."
      aside={
        <>
          <Card>
            <CardHeader title="Support channels" />
            <CardBody className="space-y-3 text-sm">
              <div>
                <p className="text-slate-500">Email</p>
                <a href={`mailto:${COMPANY.supportEmail}`} className="font-medium text-brand-700 hover:underline">{COMPANY.supportEmail}</a>
              </div>
              <div>
                <p className="text-slate-500">Phone</p>
                <p className="font-medium text-slate-900" dir="ltr">{COMPANY.phone}</p>
              </div>
              <div>
                <p className="text-slate-500">WhatsApp</p>
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline" dir="ltr">{COMPANY.whatsapp}</a>
              </div>
              <div>
                <p className="text-slate-500">Hours</p>
                <p className="font-medium text-slate-900">{COMPANY.hours}</p>
              </div>
              <div>
                <p className="text-slate-500">Office</p>
                <p className="font-medium text-slate-900">{COMPANY.address}</p>
              </div>
            </CardBody>
          </Card>
          <LegalNav />
        </>
      }
    >
      <Card>
        <CardHeader title="Send us a message" subtitle="This opens your email app with the message pre-filled." />
        <CardBody>
          <ContactForm />
        </CardBody>
      </Card>
      <p className="mt-6 text-sm text-slate-500">
        Looking for quick answers? Read the <Link href="/help" className="font-semibold text-brand-700 hover:underline">Help &amp; FAQ</Link> first — it covers prices, bidding, VAT, delivery and payments.
      </p>
    </ProsePage>
  );
}
