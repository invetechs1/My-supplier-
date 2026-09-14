"use client";

import React, { useRef } from "react";
import { SAUDI_CITIES } from "@mysupplier/shared";
import { useI18n } from "@/lib/i18n";
import { Alert, Button, Card, CardBody, Select, Textarea } from "@/components/ui";

export const SAMPLE_BOQ = `Rebar 16mm, 25, ton
Rebar 12mm, 12, ton
1200 bags OPC cement 50kg
Ready mix concrete C30, 180, m3
Hollow concrete block 20cm, 6500, piece
40 m3 washed sand`;

export interface BoqInputValue {
  text: string;
  city: string;
  verifiedOnly: boolean;
}

interface Props {
  value: BoqInputValue;
  onChange: (v: BoqInputValue) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
}

export function BoqInput({ value, onChange, onSubmit, loading, error }: Props) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const lineCount = value.text.split(/\r?\n/).filter((l) => l.trim()).length;

  const readFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      onChange({ ...value, text: value.text.trim() ? `${value.text.trimEnd()}\n${content}` : content });
    };
    reader.readAsText(file);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      noValidate
    >
      <Card>
        <CardBody className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="boq-text" className="text-sm font-medium text-slate-700">
                {t("boq.paste")}
                <span className="ms-0.5 text-red-500">*</span>
              </label>
              <div className="flex items-center gap-3 text-xs">
                <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => onChange({ ...value, text: SAMPLE_BOQ })}>
                  Try sample BOQ
                </button>
                <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => fileRef.current?.click()}>
                  Upload CSV / TXT
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    readFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                {value.text && (
                  <button type="button" className="text-slate-500 hover:underline" onClick={() => onChange({ ...value, text: "" })}>
                    Clear
                  </button>
                )}
              </div>
            </div>
            <Textarea
              id="boq-text"
              name="text"
              value={value.text}
              onChange={(e) => onChange({ ...value, text: e.target.value })}
              rows={12}
              className="font-mono text-sm"
              placeholder={
                "One item per line. Accepted formats:\n" +
                "  Rebar 16mm, 25, ton\n" +
                "  1200 bags OPC cement 50kg\n" +
                "  Ready mix concrete C30 | 180 | m3\n" +
                "  حديد تسليح 16 مم ، 25 طن\n" +
                "  description,quantity,unit  (CSV with or without header)"
              }
              onDrop={(e) => {
                e.preventDefault();
                readFile(e.dataTransfer.files?.[0]);
              }}
              onDragOver={(e) => e.preventDefault()}
              required
            />
            <p className="mt-1 text-xs text-slate-500">{lineCount > 0 ? `${lineCount} line${lineCount === 1 ? "" : "s"} · ` : ""}English and Arabic supported. Drag a file onto the box to load it.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-[220px_1fr_auto] sm:items-end">
            <Select
              label="Delivery city"
              name="city"
              value={value.city}
              onChange={(e) => onChange({ ...value, city: e.target.value })}
              placeholder="All cities"
              options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))}
            />
            <label className="flex h-10 items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={value.verifiedOnly}
                onChange={(e) => onChange({ ...value, verifiedOnly: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
              />
              Verified suppliers only
            </label>
            <Button type="submit" size="lg" variant="accent" loading={loading} disabled={!value.text.trim()}>
              {t("boq.research")}
            </Button>
          </div>
        </CardBody>
      </Card>
    </form>
  );
}
