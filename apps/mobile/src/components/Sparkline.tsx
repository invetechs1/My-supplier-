import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { PriceHistoryPoint, SeriesPoint } from "@mysupplier/shared";
import { formatSar } from "@/lib/format";
import { colors, radius, spacing, typography } from "@/theme";

interface SparklineProps {
  /** Price history (avg per day). Either `history`, `series` or `values` must be given. */
  history?: PriceHistoryPoint[];
  /** Generic dated series (e.g. dashboard revenueByDay). */
  series?: SeriesPoint[];
  /** Raw values without dates. */
  values?: number[];
  /** Labels shown under the first / last bar (defaults to the dates when available). */
  labels?: [string, string];
  height?: number;
  /** Formats the last value in the legend (default SAR). */
  format?: (value: number) => string;
  /** When true, an upward trend is shown in green (revenue); default red (prices). */
  upIsGood?: boolean;
  emptyText?: string;
  /** Hide the change / first / last legend row. */
  hideLegend?: boolean;
}

/** Tiny bar sparkline drawn with plain Views (no chart library). */
export function Sparkline({
  history,
  series,
  values: rawValues,
  labels,
  height = 64,
  format = formatSar,
  upIsGood = false,
  emptyText = "No price history yet",
  hideLegend = false,
}: SparklineProps) {
  const points: Array<{ date: string | null; value: number }> = history
    ? history.map((p) => ({ date: p.date, value: p.avg }))
    : series
      ? series.map((p) => ({ date: p.date, value: p.value }))
      : (rawValues ?? []).map((v) => ({ date: null, value: v }));

  if (!points.length) {
    return <Text style={typography.caption}>{emptyText}</Text>;
  }
  const shown = points.slice(-31);
  const values = shown.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const change = first ? ((last - first) / first) * 100 : 0;
  const goodColor = upIsGood ? colors.success : colors.danger;
  const badColor = upIsGood ? colors.danger : colors.success;
  const changeColor = change > 0 ? goodColor : change < 0 ? badColor : colors.textMuted;
  const startLabel = labels?.[0] ?? shown[0]?.date ?? "";
  const endLabel = labels?.[1] ?? shown[shown.length - 1]?.date ?? "";

  return (
    <View>
      <View style={[styles.chart, { height }]}>
        {shown.map((p, i) => {
          const ratio = (p.value - min) / span;
          const barHeight = Math.max(4, Math.round(8 + ratio * (height - 8)));
          const isLast = i === shown.length - 1;
          return (
            <View
              key={`${p.date ?? "v"}-${i}`}
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
      {!hideLegend ? (
        <View style={styles.legend}>
          <Text style={typography.caption}>{startLabel}</Text>
          <Text style={[typography.caption, { color: changeColor, fontWeight: "600" }]}>
            {first ? `${change > 0 ? "+" : ""}${change.toFixed(1)}% · ` : ""}
            {format(last)}
          </Text>
          <Text style={typography.caption}>{endLabel}</Text>
        </View>
      ) : null}
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
