"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { SAUDI_CITIES, type BoqLineInput } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { Alert, Button, Input, Modal, Select, Textarea } from "@/components/ui";

interface Props {
  open: boolean;
  onClose: () => void;
  lines: BoqLineInput[];
  defaultCity: string;
}

export function BoqRfqModal({ open, onClose, lines, defaultCity }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(`BOQ quotation request — ${new Date().toLocaleDateString("en-GB")}`);
  const [city, setCity] = useState(defaultCity || "Riyadh");
  const [closesInDays, setCloses] = useState("7");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (title.trim().length < 3) {
      setError("Give the RFQ a title.");
      return;
    }
    if (!city) {
      setError("Select a delivery city.");
      return;
    }
    setBusy(true);
    try {
      const rfq = await api.boqToRfq({
        title: title.trim(),
        deliveryCity: city,
        deliveryAddress: address.trim() || undefined,
        closesInDays: Number(closesInDays) || 7,
        notes: notes.trim() || undefined,
        lines,
      });
      router.push(`/dashboard/rfqs/${rfq.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send BOQ as RFQ"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Publish RFQ ({lines.length} lines)</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">Suppliers in the delivery city will be notified and can bid on every line until the closing date.</p>
        <Input label="Title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Delivery city" name="deliveryCity" value={city} onChange={(e) => setCity(e.target.value)} options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} required />
          <Select label="Bidding closes in" name="closesInDays" value={closesInDays} onChange={(e) => setCloses(e.target.value)} options={[{ value: "3", label: "3 days" }, { value: "7", label: "7 days" }, { value: "14", label: "14 days" }]} />
        </div>
        <Input label="Delivery address" name="deliveryAddress" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" />
        <Textarea label="Notes for suppliers" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional" />
      </div>
    </Modal>
  );
}
