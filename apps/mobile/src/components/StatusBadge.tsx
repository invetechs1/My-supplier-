import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "@/theme";

type AnyStatus =
  | "OPEN" | "CLOSED" | "AWARDED" | "CANCELLED"
  | "SUBMITTED" | "WITHDRAWN" | "ACCEPTED" | "REJECTED"
  | "PENDING" | "CONFIRMED" | "IN_TRANSIT" | "DELIVERED"
  | "SUPPLIER" | "MARKET" | "IMPORTED" | "QUOTATION"
  | "PROCESSING" | "REVIEW" | "PUBLISHED" | "FAILED"
  | "SUGGESTED" | "APPROVED"
  | "PAID" | "UNPAID" | "REFUNDED"
  | "DIRECT" | "RFQ"
  | "UNDER_REVIEW" | "VERIFIED"
  | "OWNER" | "MANAGER" | "SALES" | "WAREHOUSE"
  | (string & {});

const palette: Record<string, { bg: string; fg: string }> = {
  OPEN: { bg: colors.successLight, fg: colors.success },
  SUBMITTED: { bg: colors.infoLight, fg: colors.info },
  PENDING: { bg: colors.warningLight, fg: colors.warning },
  CONFIRMED: { bg: colors.infoLight, fg: colors.info },
  IN_TRANSIT: { bg: colors.accentLight, fg: "#B07A00" },
  DELIVERED: { bg: colors.successLight, fg: colors.success },
  AWARDED: { bg: colors.primaryLight, fg: colors.primary },
  ACCEPTED: { bg: colors.primaryLight, fg: colors.primary },
  CLOSED: { bg: colors.neutralLight, fg: colors.textSecondary },
  WITHDRAWN: { bg: colors.neutralLight, fg: colors.textSecondary },
  CANCELLED: { bg: colors.dangerLight, fg: colors.danger },
  REJECTED: { bg: colors.dangerLight, fg: colors.danger },
  SUPPLIER: { bg: colors.primaryLight, fg: colors.primary },
  MARKET: { bg: colors.infoLight, fg: colors.info },
  IMPORTED: { bg: colors.neutralLight, fg: colors.textSecondary },
  QUOTATION: { bg: colors.purpleLight, fg: colors.purple },
  // AI price imports
  PROCESSING: { bg: colors.infoLight, fg: colors.info },
  REVIEW: { bg: colors.warningLight, fg: colors.warning },
  PUBLISHED: { bg: colors.successLight, fg: colors.success },
  FAILED: { bg: colors.dangerLight, fg: colors.danger },
  SUGGESTED: { bg: colors.neutralLight, fg: colors.textSecondary },
  APPROVED: { bg: colors.successLight, fg: colors.success },
  PAID: { bg: colors.successLight, fg: colors.success },
  UNPAID: { bg: colors.warningLight, fg: colors.warning },
  REFUNDED: { bg: colors.neutralLight, fg: colors.textSecondary },
  DIRECT: { bg: colors.accentLight, fg: "#B07A00" },
  RFQ: { bg: colors.infoLight, fg: colors.info },
  // Company verification & roles (supplier portal)
  UNDER_REVIEW: { bg: colors.infoLight, fg: colors.info },
  VERIFIED: { bg: colors.successLight, fg: colors.success },
  OWNER: { bg: colors.primaryLight, fg: colors.primary },
  MANAGER: { bg: colors.infoLight, fg: colors.info },
  SALES: { bg: colors.accentLight, fg: "#B07A00" },
  WAREHOUSE: { bg: colors.purpleLight, fg: colors.purple },
};

export function statusLabel(status: string): string {
  if (status === "RFQ") return "RFQ";
  if (status === "QUOTATION") return "Quoted";
  return status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({ status, small = false }: { status: AnyStatus; small?: boolean }) {
  const c = palette[status] ?? { bg: colors.neutralLight, fg: colors.textSecondary };
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }, small && styles.small]}>
      <Text style={[styles.text, { color: c.fg }, small && styles.smallText]}>{statusLabel(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" },
  small: { paddingHorizontal: 8, paddingVertical: 2 },
  text: { fontSize: 12, fontWeight: "600" },
  smallText: { fontSize: 11 },
});
