"use client";
import React, { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { COMPANY } from "@/components/legal/Prose";
import { Alert, Button, Input, Select, Textarea } from "@/components/ui";

const TOPICS = [
  { value: "order", label: "An order or delivery" },
  { value: "payment", label: "A payment or invoice" },
  { value: "supplier", label: "Becoming a supplier" },
  { value: "prices", label: "A price or listing" },
  { value: "account", label: "My account" },
  { value: "other", label: "Something else" },
];

/** Creates a support ticket in the admin inbox (POST /contact); falls back to email if the API is unreachable. */
export function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", topic: "order", reference: "", message: "", website: "" });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mailtoHref = () => {
    const topic = TOPICS.find((t) => t.value === form.topic)?.label ?? "Enquiry";
    const subject = `[MySupplier] ${topic}${form.reference ? ` – ${form.reference.trim()}` : ""}`;
    return `mailto:${COMPANY.supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(form.message)}`;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.name.trim().length < 2) return setError("Please tell us your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError("Please enter a valid email address so we can reply.");
    if (form.message.trim().length < 10) return setError("Please describe your request in a few sentences.");
    setBusy(true);
    try {
      const topic = TOPICS.find((t) => t.value === form.topic)?.label ?? "Enquiry";
      const res = await api.contact({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        subject: topic,
        message: form.message.trim(),
        orderRef: form.reference.trim() || null,
        website: form.website, // honeypot, stays empty for humans
      });
      setSent(res.id);
      setForm({ name: "", email: "", phone: "", topic: "order", reference: "", message: "", website: "" });
    } catch (err) {
      setError(errorMessage(err, "We could not send your message."));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Alert kind="success">
        Thank you. Your message has been received (ticket <span className="font-mono" dir="ltr">{sent.slice(-8).toUpperCase()}</span>) and our team will reply to your email within one business day.
        <div className="mt-3"><Button type="button" variant="outline" size="sm" onClick={() => setSent(null)}>Send another message</Button></div>
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && (
        <Alert>
          {error}{" "}
          <a href={mailtoHref()} className="font-semibold underline">Email us instead</a>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Your name" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" required />
        <Input label="Email" name="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" dir="ltr" required />
        <Input label="Mobile (optional)" name="phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" dir="ltr" placeholder="05xxxxxxxx" />
        <Select label="Topic" name="topic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} options={TOPICS} />
        <Input label="Order / RFQ reference (optional)" name="reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="ORD-2026-000123" dir="ltr" className="sm:col-span-2" />
      </div>
      {/* Honeypot: hidden from people, filled by bots. */}
      <div className="hidden" aria-hidden="true">
        <label>Website<input tabIndex={-1} autoComplete="off" name="website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
      </div>
      <Textarea label="Message" name="message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={5} placeholder="Tell us what you need help with…" required />
      <Button type="submit" loading={busy}>Send message</Button>
    </form>
  );
}
