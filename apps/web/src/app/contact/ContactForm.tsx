"use client";
import React from "react";

import { useState } from "react";
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

/** Opens the visitor's email client with a pre-filled message to support. */
export function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", topic: "order", reference: "", message: "" });
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.message.trim().length < 10) {
      setError("Please describe your request in a few sentences.");
      return;
    }
    const topic = TOPICS.find((t) => t.value === form.topic)?.label ?? "Enquiry";
    const subject = `[MySupplier] ${topic}${form.reference ? ` – ${form.reference.trim()}` : ""}`;
    const body = [form.message.trim(), "", "—", form.name.trim() && `Name: ${form.name.trim()}`, form.email.trim() && `Email: ${form.email.trim()}`, form.reference.trim() && `Reference: ${form.reference.trim()}`]
      .filter((line) => line !== false && line !== undefined)
      .join("\n");
    window.location.href = `mailto:${COMPANY.supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setOpened(true);
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert>{error}</Alert>}
      {opened && (
        <Alert kind="success">
          Your email app should open with the message ready to send. If it did not, email us directly at <a href={`mailto:${COMPANY.supportEmail}`} className="font-semibold underline">{COMPANY.supportEmail}</a>.
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Your name" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
        <Input label="Email" name="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" dir="ltr" />
        <Select label="Topic" name="topic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} options={TOPICS} />
        <Input label="Order / RFQ reference (optional)" name="reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="ORD-2026-000123" dir="ltr" />
      </div>
      <Textarea label="Message" name="message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={5} placeholder="Tell us what you need help with…" required />
      <Button type="submit">Send email</Button>
    </form>
  );
}
