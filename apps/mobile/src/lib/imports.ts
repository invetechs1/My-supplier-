import type { ImportKind } from "@mysupplier/shared";

/** Human label for a PriceImport kind. */
export function importKindLabel(kind: ImportKind): string {
  switch (kind) {
    case "SUPPLIER_PRICE_LIST":
      return "Supplier price list";
    case "BUYER_QUOTATION":
      return "Quotation";
    case "WEB_PAGE":
      return "Web page";
    default:
      return "Pasted text";
  }
}
