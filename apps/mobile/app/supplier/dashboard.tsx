import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { OrderStatus, SupplierDashboard } from "@mysupplier/shared";
import { Screen, Card, SectionHeader, StatusBadge, Sparkline, LoadingView, ErrorView, RequireAuth, statusLabel } from "@/components";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatPct, formatSar } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography, shadow } from "@/theme";

const STATUS_ORDER: OrderStatus[] = ["PENDING", "CONFIRMED", "IN_TRANSIT", "DELIVERED", "CANCELLED"];
const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING: colors.warning,
  CONFIRMED: colors.info,
  IN_TRANSIT: "#B07A00",
  DELIVERED: colors.success,
  CANCELLED: colors.danger,
};

function compactSar(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `SAR ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 100_000) return `SAR ${(n / 1_000).toFixed(0)}K`;
  return formatSar(n);
}

interface Tile {
  key: string;
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: "primary" | "warning" | "danger" | "info" | "accent";
  hint?: string;
  onPress?: () => void;
}

const TONE: Record<NonNullable<Tile["tone"]>, { bg: string; fg: string }> = {
  primary: { bg: colors.primaryLight, fg: colors.primary },
  warning: { bg: colors.warningLight, fg: colors.warning },
  danger: { bg: colors.dangerLight, fg: colors.danger },
  info: { bg: colors.infoLight, fg: colors.info },
  accent: { bg: colors.accentLight, fg: "#B07A00" },
};

function KpiTile({ tile }: { tile: Tile }) {
  const tone = TONE[tile.tone ?? "primary"];
  const body = (
    <>
      <View style={styles.tileHead}>
        <View style={[styles.tileIcon, { backgroundColor: tone.bg }]}>
          <Ionicons name={tile.icon} size={16} color={tone.fg} />
        </View>
        {tile.onPress ? <Ionicons name="chevron-forward" size={14} color={colors.textMuted} /> : null}
      </View>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {tile.value}
      </Text>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {tile.label}
      </Text>
      {tile.hint ? (
        <Text style={typography.caption} numberOfLines={1}>
          {tile.hint}
        </Text>
      ) : null}
    </>
  );
  if (tile.onPress) {
    return (
      <Pressable onPress={tile.onPress} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.9 }]}>
        {body}
      </Pressable>
    );
  }
  return <View style={styles.tile}>{body}</View>;
}

function DashboardContent() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, canManageCompany } = useAuth();
  const { data, loading, error, refreshing, reload, refresh } = useApi(() => api.supplierDashboard(30), []);

  const tiles = useMemo<Tile[]>(() => {
    if (!data) return [];
    const k = data.kpis;
    return [
      { key: "revenue", label: `${t("revenue")} · 30d`, value: compactSar(k.revenue30d), icon: "cash-outline", tone: "primary", hint: `Total ${compactSar(k.revenueTotal)}` },
      { key: "orders", label: `${t("orders")} · 30d`, value: String(k.orders30d), icon: "receipt-outline", tone: "info", onPress: () => router.push("/(tabs)/orders") },
      { key: "pending", label: "Pending orders", value: String(k.pendingOrders), icon: "time-outline", tone: k.pendingOrders ? "warning" : "primary", onPress: () => router.push("/(tabs)/orders") },
      { key: "unpaid", label: "Unpaid orders", value: String(k.unpaidOrders), icon: "alert-circle-outline", tone: k.unpaidOrders ? "danger" : "primary" },
      { key: "rfqs", label: "Open RFQs nearby", value: String(k.openRfqsInMyCities), icon: "document-text-outline", tone: "info", onPress: () => router.push("/(tabs)/rfqs") },
      { key: "win", label: "Win rate", value: `${Math.round(k.winRatePct)}%`, icon: "trophy-outline", tone: "accent", hint: `${k.bidsWon} of ${k.bidsSubmitted} bids` },
      { key: "low", label: t("lowStock"), value: String(k.lowStockItems), icon: "cube-outline", tone: k.lowStockItems ? "danger" : "primary", hint: `${k.listings} listings`, onPress: () => router.push({ pathname: "/supplier/inventory", params: { lowStock: "1" } }) },
      { key: "msgs", label: `Unread ${t("messages").toLowerCase()}`, value: String(k.unreadMessages), icon: "chatbubbles-outline", tone: k.unreadMessages ? "warning" : "primary", onPress: () => router.push("/(tabs)/orders") },
      { key: "rating", label: "Rating", value: k.ratingCount ? `${k.rating.toFixed(1)} / 5` : "—", icon: "star-outline", tone: "accent", hint: k.ratingCount ? `${k.ratingCount} review${k.ratingCount === 1 ? "" : "s"}` : "No reviews yet" },
    ];
  }, [data, router, t]);

  if (loading && !data) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }
  if (error || !data) {
    return (
      <Screen>
        <ErrorView message={error ?? "Dashboard unavailable"} onRetry={reload} />
      </Screen>
    );
  }

  const d: SupplierDashboard = data;
  const statusMax = Math.max(1, ...STATUS_ORDER.map((s) => d.ordersByStatus?.[s] ?? 0));
  const statusTotal = STATUS_ORDER.reduce((sum, s) => sum + (d.ordersByStatus?.[s] ?? 0), 0);

  return (
    <Screen scroll refreshing={refreshing} onRefresh={refresh} edges={["bottom", "left", "right"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={typography.h2}>{d.company?.name ?? user?.company?.name ?? "My company"}</Text>
          <Text style={typography.bodySmall}>Last 30 days · {formatDate(new Date().toISOString())}</Text>
        </View>
        <StatusBadge status={d.company?.verificationStatus ?? (d.company?.verified ? "VERIFIED" : "PENDING")} small />
      </View>

      <View style={styles.grid}>
        {tiles.map((tile) => (
          <KpiTile key={tile.key} tile={tile} />
        ))}
      </View>

      <View style={styles.quickLinks}>
        <QuickLink icon="cube-outline" label={t("inventory")} onPress={() => router.push("/supplier/inventory")} />
        <QuickLink icon="pricetags-outline" label="Prices" onPress={() => router.push("/supplier/prices")} />
        {canManageCompany ? <QuickLink icon="wallet-outline" label={t("finance")} onPress={() => router.push("/supplier/finance")} /> : null}
        {canManageCompany ? <QuickLink icon="people-outline" label={t("team")} onPress={() => router.push("/supplier/team")} /> : null}
        <QuickLink icon="business-outline" label="Company" onPress={() => router.push("/supplier/company")} />
      </View>

      <SectionHeader title={`${t("revenue")} by day`} />
      <Card>
        <Sparkline series={d.revenueByDay} upIsGood emptyText="No revenue in this period yet" />
      </Card>

      <SectionHeader title="Orders by status" />
      <Card>
        {statusTotal === 0 ? <Text style={typography.bodySmall}>No orders yet.</Text> : null}
        {STATUS_ORDER.map((s) => {
          const n = d.ordersByStatus?.[s] ?? 0;
          const pct = statusMax ? n / statusMax : 0;
          return (
            <View key={s} style={styles.statusRow}>
              <Text style={styles.statusLabel} numberOfLines={1}>
                {statusLabel(s)}
              </Text>
              <View style={styles.statusTrack}>
                <View style={[styles.statusFill, { width: `${Math.max(n ? 4 : 0, Math.round(pct * 100))}%`, backgroundColor: STATUS_COLOR[s] }]} />
              </View>
              <Text style={styles.statusCount}>{n}</Text>
            </View>
          );
        })}
      </Card>

      <SectionHeader title="Top products" />
      <Card style={{ paddingVertical: spacing.xs }}>
        {d.topProducts.length ? (
          d.topProducts.map((p, i) => (
            <Pressable key={p.material.id} onPress={() => router.push(`/shop/product/${p.material.id}`)} style={[styles.listRow, i > 0 && styles.listRowBorder]}>
              <View style={styles.rank}>
                <Text style={styles.rankText}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle} numberOfLines={1}>
                  {p.material.name}
                </Text>
                <Text style={typography.caption}>
                  {p.quantity} {p.material.unit} · {p.orders} order{p.orders === 1 ? "" : "s"}
                </Text>
              </View>
              <Text style={styles.listValue}>{formatSar(p.revenue)}</Text>
            </Pressable>
          ))
        ) : (
          <Text style={[typography.bodySmall, { paddingVertical: spacing.sm }]}>No sales in this period yet.</Text>
        )}
      </Card>

      <SectionHeader title="Price competitiveness" actionTitle="My prices" onAction={() => router.push("/supplier/prices")} />
      <Card style={{ paddingVertical: spacing.xs }}>
        {d.priceCompetitiveness.length ? (
          d.priceCompetitiveness.map((p, i) => {
            const cheaper = p.diffPct < 0;
            const flat = Math.abs(p.diffPct) < 0.05;
            const color = flat ? colors.textMuted : cheaper ? colors.success : colors.danger;
            return (
              <Pressable key={p.listingId} onPress={() => router.push(`/supplier/inventory/${p.listingId}`)} style={[styles.listRow, i > 0 && styles.listRowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle} numberOfLines={1}>
                    {p.material.name}
                  </Text>
                  <Text style={typography.caption}>
                    Market avg {formatSar(p.marketAvg)} · min {formatSar(p.marketMin)} · #{p.rank} of {p.sellers}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.listValue}>{formatSar(p.myPrice)}</Text>
                  <View style={[styles.diffPill, { backgroundColor: flat ? colors.neutralLight : cheaper ? colors.successLight : colors.dangerLight }]}>
                    <Ionicons name={flat ? "remove" : cheaper ? "arrow-down" : "arrow-up"} size={11} color={color} />
                    <Text style={[styles.diffText, { color }]}>{formatPct(p.diffPct)}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        ) : (
          <Text style={[typography.bodySmall, { paddingVertical: spacing.sm }]}>Add prices to compare them with the market.</Text>
        )}
      </Card>

      <SectionHeader title="Recent orders" actionTitle={t("seeAll")} onAction={() => router.push("/(tabs)/orders")} />
      <Card style={{ paddingVertical: spacing.xs }}>
        {d.recentOrders.length ? (
          d.recentOrders.map((o, i) => (
            <Pressable key={o.id} onPress={() => router.push(`/order/${o.id}`)} style={[styles.listRow, i > 0 && styles.listRowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{o.reference}</Text>
                <Text style={typography.caption} numberOfLines={1}>
                  {formatDate(o.createdAt)} · {o.items?.length ? `${o.items.length} item${o.items.length === 1 ? "" : "s"}` : o.rfq?.title ?? "RFQ order"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={styles.listValue}>{formatSar(o.total)}</Text>
                <StatusBadge status={o.status} small />
              </View>
            </Pressable>
          ))
        ) : (
          <Text style={[typography.bodySmall, { paddingVertical: spacing.sm }]}>No orders yet.</Text>
        )}
      </Card>

      {d.recentReviews.length ? (
        <>
          <SectionHeader title="Recent reviews" />
          <Card style={{ paddingVertical: spacing.xs }}>
            {d.recentReviews.map((r, i) => (
              <Pressable key={r.id} onPress={() => router.push(`/order/${r.orderId}`)} style={[styles.listRow, i > 0 && styles.listRowBorder]}>
                <View style={{ flex: 1 }}>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Ionicons key={n} name={n <= r.rating ? "star" : "star-outline"} size={14} color={colors.accent} />
                    ))}
                    <Text style={[typography.caption, { marginLeft: 6 }]}>{r.buyer?.company?.name ?? r.buyer?.name ?? "Buyer"}</Text>
                  </View>
                  {r.comment ? (
                    <Text style={typography.bodySmall} numberOfLines={2}>
                      {r.comment}
                    </Text>
                  ) : null}
                  {!r.reply ? <Text style={[typography.caption, { color: colors.primary, marginTop: 2 }]}>Tap to reply</Text> : null}
                </View>
                <Text style={typography.caption}>{formatDate(r.createdAt)}</Text>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function QuickLink({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quick, pressed && { opacity: 0.85 }]}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.quickLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function SupplierDashboardScreen() {
  return (
    <RequireAuth roles={["SUPPLIER"]} message="The business dashboard is for supplier accounts.">
      <DashboardContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: spacing.md },
  tile: { width: "48.5%", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.card },
  tileHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tileIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  tileValue: { fontSize: 20, fontWeight: "800", color: colors.text, marginTop: spacing.sm },
  tileLabel: { ...typography.bodySmall, fontWeight: "600", marginTop: 2 },
  quickLinks: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg, flexWrap: "wrap" },
  quick: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.primaryLight },
  quickLabel: { fontSize: 13, fontWeight: "600", color: colors.primary },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  statusLabel: { ...typography.bodySmall, width: 84 },
  statusTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.neutralLight, overflow: "hidden" },
  statusFill: { height: "100%", borderRadius: 5 },
  statusCount: { ...typography.body, fontWeight: "700", width: 32, textAlign: "right" },
  listRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  listRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  listTitle: { ...typography.body, fontWeight: "600" },
  listValue: { ...typography.body, fontWeight: "700" },
  rank: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  rankText: { fontSize: 12, fontWeight: "700", color: colors.primary },
  diffPill: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, marginTop: 3 },
  diffText: { fontSize: 11, fontWeight: "700" },
  starsRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
});
