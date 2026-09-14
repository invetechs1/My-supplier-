import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors, radius, spacing, typography, shadow } from "@/theme";

interface PriceTileProps {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "primary" | "accent";
  style?: ViewStyle;
}

export function PriceTile({ label, value, sub, tone = "default", style }: PriceTileProps) {
  const toneStyle =
    tone === "primary"
      ? { backgroundColor: colors.primary }
      : tone === "accent"
        ? { backgroundColor: colors.accentLight }
        : { backgroundColor: colors.surface };
  const textColor = tone === "primary" ? "#fff" : colors.text;
  const labelColor = tone === "primary" ? "rgba(255,255,255,0.8)" : colors.textMuted;
  return (
    <View style={[styles.tile, toneStyle, style]}>
      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      <Text style={[styles.value, { color: textColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <Text style={[styles.sub, { color: labelColor }]}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: "30%",
    padding: spacing.md,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  label: { ...typography.caption, textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontSize: 16, fontWeight: "700", marginTop: 4 },
  sub: { ...typography.caption, marginTop: 2 },
});
