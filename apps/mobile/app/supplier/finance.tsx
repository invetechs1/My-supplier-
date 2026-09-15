import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { FinanceSummary, StatementLine } from "@mysupplier/shared";
import { Screen, EmptyState, ErrorView, LoadingView, RequireAuth, StatusBadge } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatSar } from "@/lib/format";
import { colors, radius, spacing, typography, shadow } from "@/theme";

function Tile({ label, value, icon, tone = "primary", wide = false }: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap; tone?: "primary" | "accent" | "warning" | "info" | "neutral"; wide?: boolean }) {
  const palette = {
    primary: { bg: colors.primary, fg: "#fff", sub: "rgba(255,255,255,0.8)" },
    accent: { bg: colors.accentLight, fg: colors.text, sub: "#B07A00" },
    warning: { bg: colors.warningLight, fg: colors.text, sub: colors.warning },
    info: { bg: colors.infoLight, fg: colors.text, sub: colors.info },
    neutral: { bg: colors.surface, fg: colors.text, sub: colors.textMuted },
  }[tone];
  return (
    <View style={[styles.tile, wide && styles.tileWide, { backgroundColor: palette.bg }]}>
      <View style={styles.tileHead}>
        <Ionicons name={icon} size={16} color={palette.sub} />
        <Text style={[styles.tileLabel, { color: palette.sub }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.tileValue, { color: palette.fg }, wide && { fontSize: 26 }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function FinanceContent() {
  const router = useRouter();
  const { t } = useI18n();
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await api.financeSummary());
      setSummaryError(null);
    } catch (err) {
      setSummaryError(getErrorMessage(err));
    }
  }, []);

  const fetchPage = useCallback(async (target: number, mode: "reset" | "more" | "refresh") => {
    const id = ++reqId.current;
    if (mode === "reset") setLoading(true);
    if (mode === "more") setLoadingMore(true);
    if (mode === "refresh") setRefreshing(true);
    setError(null);
    try {
      const res = await api.financeStatement({ page: target });
      if (id !== reqId.current) return;
      setTotal(res.total);
      setPage(res.page);
      setLines((prev) => (mode === "more" ? [...prev, ...res.data] : res.data));
    } catch (err) {
      if (id !== reqId.current) return;
      setError(getErrorMessage(err));
    } finally {
      if (id === reqId.current) {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadSummary();
    fetchPage(1, "reset");
  }, [loadSummary, fetchPage]);

  const hasMore = lines.length < total;

  const header = (
    <View style={styles.header}>
      {summary ? (
        <>
          <View style={styles.grid}>
            <Tile label="Pending payout" value={formatSar(summary.pendingPayout)} icon="hourglass-outline" tone="primary" wide />
            <Tile label="Net earned" value={formatSar(summary.netEarned)} icon="trending-up-outline" tone="accent" />
            <Tile label="Paid out" value={formatSar(summary.paidOut)} icon="checkmark-done-outline" tone="neutral" />
            <Tile label="Gross paid" value={formatSar(summary.grossPaid)} icon="cash-outline" tone="neutral" />
            <Tile label={`Commission ${summary.commissionPct}%`} value={formatSar(summary.commission)} icon="pie-chart-outline" tone="neutral" />
            <Tile label="Awaiting delivery" value={formatSar(summary.awaitingDelivery)} icon="car-outline" tone="info" />
            <Tile label="Unpaid receivables" value={formatSar(summary.unpaidReceivables)} icon="alert-circle-outline" tone="warning" />
          </View>
          <Text style={[typography.caption, { marginTop: spacing.sm }]}>
            Payouts cover paid and delivered orders, net of the {summary.commissionPct}% platform commission. Amounts in {summary.currency}.
          </Text>
        </>
      ) : summaryError ? (
        <View style={styles.summaryError}>
          <Text style={[typography.bodySmall, { flex: 1 }]}>{summaryError}</Text>
          <Pressable onPress={loadSummary} hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: "600" }}>{t("retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
      )}
      <View style={styles.statementHead}>
        <Text style={[typography.h2, { fontSize: 18 }]}>Statement</Text>
        <Text style={typography.caption}>
          {total} order{total === 1 ? "" : "s"}
        </Text>
      </View>
    </View>
  );

  return (
    <Screen padded={false} edges={["bottom", "left", "right"]}>
      {loading && lines.length === 0 && !summary ? (
        <LoadingView />
      ) : error && lines.length === 0 && !summary ? (
        <ErrorView message={error} onRetry={() => fetchPage(1, "reset")} />
      ) : (
        <FlatList
          data={lines}
          keyExtractor={(l) => l.order.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={header}
          refreshing={refreshing}
          onRefresh={() => {
            loadSummary();
            fetchPage(1, "refresh");
          }}
          onEndReached={() => {
            if (!loading && !loadingMore && hasMore) fetchPage(page + 1, "more");
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            error ? (
              <ErrorView message={error} onRetry={() => fetchPage(1, "reset")} />
            ) : loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
            ) : (
              <EmptyState icon="wallet-outline" title="No paid orders yet" message="Lines appear here once buyers pay for orders." />
            )
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary} /> : null}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/order/${item.order.id}`)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.order.reference}</Text>
                  <Text style={typography.caption}>
                    {formatDate(item.order.createdAt)} · {item.order.paymentMethod ?? "—"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <StatusBadge status={item.order.status} small />
                  <StatusBadge status={item.order.paymentStatus} small />
                </View>
              </View>
              <View style={styles.amounts}>
                <View style={styles.amountCol}>
                  <Text style={typography.caption}>Gross</Text>
                  <Text style={styles.amount}>{formatSar(item.gross)}</Text>
                </View>
                <View style={styles.amountCol}>
                  <Text style={typography.caption}>Commission {item.commissionPct}%</Text>
                  <Text style={[styles.amount, { color: colors.danger }]}>−{formatSar(item.commission)}</Text>
                </View>
                <View style={styles.amountCol}>
                  <Text style={typography.caption}>Net</Text>
                  <Text style={[styles.amount, { color: colors.primary }]}>{formatSar(item.net)}</Text>
                </View>
              </View>
              <Text style={[typography.caption, { marginTop: spacing.xs }]}>
                {item.payout
                  ? item.payout.status === "PAID"
                    ? `Paid out${item.payout.reference ? ` · ref ${item.payout.reference}` : ""}`
                    : "In a pending payout"
                  : item.order.paymentStatus === "PAID"
                    ? item.order.status === "DELIVERED"
                      ? "Payout pending"
                      : "Awaiting delivery"
                    : "Buyer has not paid yet"}
              </Text>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

function FinanceGate() {
  const { canManageCompany } = useAuth();
  const router = useRouter();
  if (!canManageCompany) {
    return (
      <Screen>
        <EmptyState icon="lock-closed-outline" title="Owners and managers only" message="Ask a company owner to grant you the MANAGER role to see finance." actionTitle="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }
  return <FinanceContent />;
}

export default function SupplierFinanceScreen() {
  return (
    <RequireAuth roles={["SUPPLIER"]} message="Finance is available to supplier accounts.">
      <FinanceGate />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: spacing.lg },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: spacing.md },
  tile: { width: "48.5%", borderRadius: radius.lg, padding: spacing.md, ...shadow.card },
  tileWide: { width: "100%" },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  tileLabel: { fontSize: 12, fontWeight: "600", flex: 1 },
  tileValue: { fontSize: 18, fontWeight: "800", marginTop: spacing.sm },
  summaryError: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerLight },
  statementHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.md },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  cardTitle: { ...typography.body, fontWeight: "700" },
  amounts: { flexDirection: "row", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  amountCol: { flex: 1 },
  amount: { ...typography.body, fontWeight: "700", marginTop: 2 },
});
