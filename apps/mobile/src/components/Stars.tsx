import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, typography } from "@/theme";

interface StarsProps {
  value: number;
  size?: number;
  /** When set, the stars become a 1..5 picker. */
  onChange?: (value: number) => void;
  /** Show the numeric value / count next to the stars (display mode only). */
  count?: number | null;
  showValue?: boolean;
  style?: ViewStyle;
}

/** Star rating: read-only (supports halves) or interactive picker. */
export function Stars({ value, size = 14, onChange, count, showValue = false, style }: StarsProps) {
  const stars = [1, 2, 3, 4, 5].map((i) => {
    const name: keyof typeof Ionicons.glyphMap = value >= i ? "star" : value >= i - 0.5 && !onChange ? "star-half" : "star-outline";
    const icon = <Ionicons name={name} size={size} color={value >= i - 0.5 ? colors.accent : colors.textMuted} />;
    if (!onChange) return <View key={i}>{icon}</View>;
    return (
      <Pressable key={i} onPress={() => onChange(i)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${i}`}>
        {icon}
      </Pressable>
    );
  });
  return (
    <View style={[styles.row, onChange ? { gap: 8 } : null, style]}>
      {stars}
      {showValue && value > 0 ? <Text style={[styles.value, { fontSize: Math.max(11, size - 2) }]}>{value.toFixed(1)}</Text> : null}
      {count !== undefined && count !== null ? <Text style={[styles.count, { fontSize: Math.max(11, size - 2) }]}>({count})</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 2 },
  value: { ...typography.caption, fontWeight: "700", color: colors.text, marginLeft: 4 },
  count: { ...typography.caption, marginLeft: 2 },
});
