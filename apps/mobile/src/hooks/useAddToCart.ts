import { useCallback, useState } from "react";
import { Alert } from "react-native";
import type { Material, ShopOffer } from "@mysupplier/shared";
import { getErrorMessage } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";

/** Wraps cart.addItem with a busy flag, success toast and error alert. */
export function useAddToCart() {
  const { addItem, showToast } = useCart();
  const { t } = useI18n();
  const [adding, setAdding] = useState<string | null>(null);

  const add = useCallback(
    async (offer: ShopOffer, material: Material, quantity?: number): Promise<boolean> => {
      if (offer.source === "MARKET" || offer.source === "IMPORTED") {
        Alert.alert(t("referencePrice"), "This is a market reference price and cannot be ordered directly.");
        return false;
      }
      setAdding(offer.listingId);
      try {
        await addItem(offer, material, quantity ?? Math.max(1, offer.minQty || 1));
        showToast(t("addedToCart"));
        return true;
      } catch (err) {
        Alert.alert(t("cart"), getErrorMessage(err));
        return false;
      } finally {
        setAdding(null);
      }
    },
    [addItem, showToast, t],
  );

  return { add, adding };
}

export function isPurchasable(offer: ShopOffer | null | undefined): boolean {
  return Boolean(offer && offer.source !== "MARKET" && offer.source !== "IMPORTED");
}

/** % the best offer sits below the average price (0 when not a deal). */
export function dealPercent(avgPrice: number | null | undefined, bestPrice: number | null | undefined): number {
  if (!avgPrice || !bestPrice || bestPrice >= avgPrice) return 0;
  return Math.round(((avgPrice - bestPrice) / avgPrice) * 100);
}
