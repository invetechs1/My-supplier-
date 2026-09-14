import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { PriceHistoryPoint } from "@mysupplier/shared";
import { formatSar } from "@/lib/format";
import { colors, radius, spacing, typography } from "@/theme";

interface SparklineProps {
  history: PriceHistoryPoint[];
  height?: number;
}

/** Tiny bar sparkline drawn with plain Views (no chart library). */
export function Sparkline({ history, height = 64 }: SparklineProps) {
  if (!history.length) {
    return <Text style={typography.caption}>No price history yet</Text>;
  }
  const points = history.slice(-30);
  const values = points.map((p) => p.avg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const change = first ? ((last - first) / first) * 100 : 0;
  const changeColor = change > 0 ? colors.danger : change < 0 ? colors.success : colors.textMuted;

  return (
    <View>
      <View style={[styles.chart, { height }]}>
        {points.map((p, i) => {
          const ratio = (p.avg - min) / span;
          const barHeight = Math.max(4, Math.round(8 + ratio * (height - 8)));
          const isLast = i === points.length - 1;
          return (
            <View
              key={`${p.date}-${i}`}
              style={[
                styles.bar,
                {
                  height: barHeight,
                  backgroundColor: isLast ? colors.accent : colors.primary,
                  opacity: isLast ? 1 : 0.45 + ratio * 0.55,
                },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.legend}>
        <Text style={typography.caption}>{points[0]?.date}</Text>
        <Text style={[typography.caption, { color: changeColor, fontWeight: "600" }]}>
          {change > 0 ? "+" : ""}
          {change.toFixed(1)}% · {formatSar(last)}
        </Text>
        <Text style={typography.caption}>{points[points.length - 1]?.date}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    backgroundColor: colors.neutralLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    overflow: "hidden",
  },
  bar: { flex: 1, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  legend: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
});
