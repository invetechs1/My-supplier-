import QRCode from "qrcode";

/**
 * ZATCA (Saudi tax authority) phase-1 simplified tax invoice QR:
 * TLV of seller name (1), VAT number (2), timestamp ISO (3), total incl. VAT (4), VAT amount (5), base64 encoded.
 */
export function zatcaTlvBase64(input: { sellerName: string; vatNumber: string; timestamp: Date; total: number; vat: number }): string {
  const tag = (t: number, v: string) => {
    const bytes = Buffer.from(v, "utf8");
    return Buffer.concat([Buffer.from([t, bytes.length]), bytes]);
  };
  return Buffer.concat([
    tag(1, input.sellerName),
    tag(2, input.vatNumber),
    tag(3, input.timestamp.toISOString()),
    tag(4, input.total.toFixed(2)),
    tag(5, input.vat.toFixed(2)),
  ]).toString("base64");
}

export async function qrSvg(data: string): Promise<string> {
  return QRCode.toString(data, { type: "svg", margin: 1, width: 160, errorCorrectionLevel: "M" });
}
