import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PriceAlert } from "@mysupplier/shared";
import { api, getErrorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { colors, radius, spacing, typography } from "@/theme";
import { BottomSheet } from "../BottomSheet";
import { Button } from "../Button";
import { TextField } from "../TextField";

interface Props {
  visible: boolean;
  materialId: string;
  productName: string;
  currentPrice: number | null;
  inStock: boolean;
  city?: string | null;
  onClose: () => void;
  onCreated: (alert: PriceAlert) => void;
}

/** Create / update a price-drop or back-in-stock alert (POST /alerts upserts per product). */
export function PriceAlertSheet({ visible, materialId, productName, currentPrice, inStock, city, onClose, onCreated }: Props) {
  const { t } = useI18n();
  const suggested = currentPrice ? Math.floor(currentPrice * 0.9) : null;
  const [target, setTarget] = useState(suggested ? String(suggested) : "");
  const [backInStock, setBackInStock] = useState(!inStock);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setTarget(suggested ? String(suggested) : "");
      setBackInStock(!inStock);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const submit = async () => {
    const value = target.trim() ? Number(target.replace(/,/g, "")) : null;
    if (target.trim() && (!Number.isFinite(value) || (value as number) <= 0)) return setError(`${t("targetPrice")}: ${t("min")} 1`);
    if (value === null && !backInStock) return setError(t("priceAlertHint"));
    setBusy(true);
    setError(null);
    try {
      const alert = await api.createAlert({ materialId, targetPrice: value, notifyBackInStock: backInStock, city: city ?? undefined });
      onCreated(alert);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t("priceAlert")} subtitle={productName}>
      {currentPrice ? (
        <View style={styles.current}>
          <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
          <Text style={typography.bodySmall}>
            {t("currentBest")}: <Text style={{ fontWeight: "700", color: colors.text }}>{formatSar(currentPrice)}</Text>
          </Text>
        </View>
      ) : null}
      <TextField
        label={`${t("targetPrice")} (SAR)`}
        value={target}
        onChangeText={setTarget}
        keyboardType="decimal-pad"
        placeholder={suggested ? String(suggested) : "0"}
        hint={t("priceAlertHint")}
      />
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={typography.body}>{t("notifyBackInStock")}</Text>
          {!inStock ? <Text style={typography.caption}>{t("outOfStock")}</Text> : null}
        </View>
        <Switch value={backInStock} onValueChange={setBackInStock} trackColor={{ true: colors.primary }} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={t("setPriceAlert")} icon="notifications-outline" size="lg" fullWidth loading={busy} onPress={() => void submit()} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  current: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryLight, marginBottom: spacing.md },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md },
  error: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
});
