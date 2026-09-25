import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { OrderExtended, ReturnReason, ReturnRequest } from "@mysupplier/shared";
import { api, getErrorMessage } from "@/lib/api";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { formatSar } from "@/lib/format";
import { colors, spacing, typography } from "@/theme";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { PickerField, PickerModal } from "./PickerModal";
import { QtyStepper } from "./QtyStepper";
import { TextField } from "./TextField";

export const RETURN_REASON_KEYS: Record<ReturnReason, TranslationKey> = {
  DAMAGED: "reasonDamaged",
  DEFECTIVE: "reasonDefective",
  WRONG_ITEM: "reasonWrongItem",
  NOT_AS_DESCRIBED: "reasonNotAsDescribed",
  EXCESS: "reasonExcess",
  OTHER: "reasonOther",
};
const REASONS = Object.keys(RETURN_REASON_KEYS) as ReturnReason[];

interface Props {
  order: OrderExtended;
  visible: boolean;
  onClose: () => void;
  onSubmitted: (ret: ReturnRequest) => void;
}

/** "Request return" for an IN_TRANSIT / DELIVERED order: reason, details and per-line quantities. */
export function ReturnSheet({ order, visible, onClose, onSubmitted }: Props) {
  const { t } = useI18n();
  const [reason, setReason] = useState<ReturnReason | "">("");
  const [reasonOpen, setReasonOpen] = useState(false);
  const [details, setDetails] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setReason("");
      setDetails("");
      setQty({});
      setError(null);
    }
  }, [visible]);

  const items = order.items ?? [];
  const selected = items.filter((it) => (qty[it.id] ?? 0) > 0);
  const estimate = selected.reduce((s, it) => s + it.unitPrice * (qty[it.id] ?? 0), 0);

  const toggle = (id: string, max: number) => setQty((q) => ({ ...q, [id]: q[id] ? 0 : max }));

  const submit = async () => {
    if (!reason) return setError(t("returnReason"));
    if (!selected.length) return setError(t("selectItems"));
    setBusy(true);
    setError(null);
    try {
      const ret = await api.createReturn(order.id, {
        reason,
        details: details.trim() || undefined,
        items: selected.map((it) => ({ orderItemId: it.id, quantity: qty[it.id] })),
      });
      onSubmitted(ret);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t("requestReturn")} subtitle={order.reference}>
      <Text style={[typography.caption, { marginBottom: spacing.md }]}>{t("returnWindowHint")}</Text>
      <PickerField label={t("returnReason")} value={reason ? t(RETURN_REASON_KEYS[reason]) : ""} placeholder={t("returnReason")} onPress={() => setReasonOpen(true)} />
      <TextField label={`${t("returnDetails")} (${t("optional")})`} value={details} onChangeText={setDetails} placeholder={t("returnDetailsPlaceholder")} multiline maxLength={1000} />

      <Text style={styles.label}>{t("selectItems")}</Text>
      {items.map((it) => {
        const on = (qty[it.id] ?? 0) > 0;
        return (
          <View key={it.id} style={styles.item}>
            <Pressable onPress={() => toggle(it.id, it.quantity)} style={styles.itemHead} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? colors.primary : colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {it.name}
                </Text>
                <Text style={typography.caption}>
                  {it.quantity} {it.unit} × {formatSar(it.unitPrice)}
                </Text>
              </View>
            </Pressable>
            {on ? (
              <View style={styles.qtyRow}>
                <Text style={typography.caption}>{t("returnQty")}</Text>
                <QtyStepper value={qty[it.id]} onChange={(n) => setQty((q) => ({ ...q, [it.id]: n }))} min={1} max={it.quantity} size="sm" />
              </View>
            ) : null}
          </View>
        );
      })}

      {selected.length ? (
        <View style={styles.estimate}>
          <Text style={typography.bodySmall}>{t("estimatedRefund")}</Text>
          <Text style={styles.estimateValue}>~{formatSar(estimate * 1.15)}</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={t("submitReturn")} icon="return-down-back-outline" size="lg" fullWidth loading={busy} disabled={!reason || !selected.length} onPress={() => void submit()} />

      <PickerModal
        visible={reasonOpen}
        title={t("returnReason")}
        options={REASONS.map((r) => ({ value: r, label: t(RETURN_REASON_KEYS[r]) }))}
        value={reason || null}
        onSelect={(r) => setReason(r)}
        onClose={() => setReasonOpen(false)}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.label, marginBottom: spacing.xs },
  item: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  itemName: { ...typography.body, fontWeight: "500" },
  qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, paddingLeft: 30 },
  estimate: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md, marginBottom: spacing.sm },
  estimateValue: { fontSize: 16, fontWeight: "700", color: colors.primary },
  error: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
});
