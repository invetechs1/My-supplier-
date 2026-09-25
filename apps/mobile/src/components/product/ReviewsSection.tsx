import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ProductReview, ProductReviewSummary } from "@mysupplier/shared";
import { api, getErrorMessage, type ReviewSort } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography } from "@/theme";
import { BottomSheet } from "../BottomSheet";
import { Button } from "../Button";
import { Card, SectionHeader } from "../Card";
import { Stars } from "../Stars";
import { TextField } from "../TextField";

function Distribution({ summary }: { summary: ProductReviewSummary }) {
  const total = Math.max(1, summary.count);
  return (
    <View style={{ flex: 1, gap: 4 }}>
      {[5, 4, 3, 2, 1].map((star) => {
        const n = summary.distribution?.[star as 1 | 2 | 3 | 4 | 5] ?? 0;
        return (
          <View key={star} style={styles.distRow}>
            <Text style={styles.distLabel}>{star}</Text>
            <Ionicons name="star" size={10} color={colors.accent} />
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${Math.round((n / total) * 100)}%` }]} />
            </View>
            <Text style={styles.distCount}>{n}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ReviewSheet({ visible, materialId, onClose, onSubmitted }: { visible: boolean; materialId: string; onClose: () => void; onSubmitted: (r: ProductReview) => void }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (rating < 1) return setError(t("yourRating"));
    setBusy(true);
    setError(null);
    try {
      const review = await api.createProductReview(materialId, { rating, title: title.trim() || undefined, body: body.trim() || undefined });
      onSubmitted(review);
      setRating(0);
      setTitle("");
      setBody("");
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t("writeReview")}>
      <Text style={styles.fieldLabel}>{t("yourRating")}</Text>
      <Stars value={rating} size={32} onChange={setRating} style={{ marginBottom: spacing.md }} />
      <TextField label={`${t("reviewTitle")} (${t("optional")})`} value={title} onChangeText={setTitle} maxLength={120} />
      <TextField label={`${t("reviewBody")} (${t("optional")})`} value={body} onChangeText={setBody} placeholder={t("reviewPlaceholder")} multiline maxLength={2000} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={t("submitReview")} icon="star-outline" size="lg" fullWidth loading={busy} disabled={rating < 1} onPress={() => void submit()} />
    </BottomSheet>
  );
}

interface Props {
  materialId: string;
  summary: ProductReviewSummary;
}

/** Ratings summary, review list (sortable) and the "write a review" flow. */
export function ReviewsSection({ materialId, summary: initialSummary }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const { isAuthenticated, isBuyer } = useAuth();
  const { showToast } = useCart();
  const [sort, setSort] = useState<ReviewSort>("recent");
  const [page, setPage] = useState(1);
  const [extra, setExtra] = useState<ProductReview[]>([]);
  const [writeOpen, setWriteOpen] = useState(false);
  const [helpfulDone, setHelpfulDone] = useState<Record<string, number>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const reviews = useApi(() => api.productReviews(materialId, { sort, page: 1 }), [materialId, sort]);

  const summary = reviews.data?.summary ?? initialSummary;
  const list = [...(reviews.data?.data ?? []), ...extra];
  const total = reviews.data?.total ?? summary.count;
  const hasMore = list.length < total;

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await api.productReviews(materialId, { sort, page: page + 1 });
      setExtra((prev) => [...prev, ...res.data]);
      setPage(page + 1);
    } catch {
      // keep what we have
    } finally {
      setLoadingMore(false);
    }
  };

  const markHelpful = async (r: ProductReview) => {
    if (helpfulDone[r.id] !== undefined) return;
    try {
      const res = await api.markReviewHelpful(r.id);
      setHelpfulDone((prev) => ({ ...prev, [r.id]: res.helpful }));
    } catch {
      // ignore
    }
  };

  const write = () => {
    if (!isAuthenticated) return router.push("/(auth)/login");
    setWriteOpen(true);
  };

  return (
    <View>
      <SectionHeader title={`${t("reviews")}${summary.count ? ` (${summary.count})` : ""}`} actionTitle={isBuyer || !isAuthenticated ? t("writeReview") : undefined} onAction={write} />
      <Card>
        {summary.count > 0 ? (
          <View style={styles.summaryRow}>
            <View style={styles.avgBox}>
              <Text style={styles.avg}>{summary.average.toFixed(1)}</Text>
              <Stars value={summary.average} size={14} />
              <Text style={typography.caption}>
                {summary.count} {t("reviews").toLowerCase()}
              </Text>
            </View>
            <Distribution summary={summary} />
          </View>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="chatbubble-ellipses-outline" size={28} color={colors.textMuted} />
            <Text style={[typography.body, { fontWeight: "600", marginTop: spacing.xs }]}>{t("noReviewsYet")}</Text>
            <Text style={typography.caption}>{t("beFirstReview")}</Text>
            {isBuyer || !isAuthenticated ? <Button title={t("writeReview")} size="sm" variant="secondary" onPress={write} style={{ marginTop: spacing.md }} /> : null}
          </View>
        )}

        {summary.count > 0 ? (
          <View style={styles.sortRow}>
            {(["recent", "helpful", "rating"] as ReviewSort[]).map((s) => (
              <Pressable
                key={s}
                onPress={() => {
                  setSort(s);
                  setExtra([]);
                  setPage(1);
                }}
                style={[styles.sortChip, sort === s && styles.sortChipActive]}
              >
                <Text style={[styles.sortText, sort === s && styles.sortTextActive]}>{s === "recent" ? t("sortNewest") : s === "helpful" ? t("helpful") : t("rating")}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {reviews.loading && !reviews.data ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} /> : null}
        {list.map((r, i) => {
          const helpful = helpfulDone[r.id] ?? r.helpful;
          return (
            <View key={r.id} style={[styles.review, i > 0 && styles.reviewBorder]}>
              <View style={styles.reviewHead}>
                <Stars value={r.rating} size={13} />
                {r.verified ? (
                  <View style={styles.verified}>
                    <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                    <Text style={styles.verifiedText}>{t("verifiedPurchase")}</Text>
                  </View>
                ) : null}
                <Text style={[typography.caption, { marginLeft: "auto" }]}>{formatDate(r.createdAt)}</Text>
              </View>
              {r.title ? <Text style={styles.reviewTitle}>{r.title}</Text> : null}
              {r.body ? <Text style={styles.reviewBody}>{r.body}</Text> : null}
              <Text style={typography.caption}>
                {r.user?.name ?? "—"}
                {r.user?.companyName ? ` · ${r.user.companyName}` : ""}
              </Text>
              {r.supplierReply ? (
                <View style={styles.reply}>
                  <Text style={styles.replyTitle}>{t("supplierReply")}</Text>
                  <Text style={typography.bodySmall}>{r.supplierReply}</Text>
                </View>
              ) : null}
              <Pressable onPress={() => void markHelpful(r)} style={styles.helpfulBtn} disabled={helpfulDone[r.id] !== undefined} hitSlop={6}>
                <Ionicons name={helpfulDone[r.id] !== undefined ? "thumbs-up" : "thumbs-up-outline"} size={14} color={colors.primary} />
                <Text style={styles.helpfulText}>
                  {t("helpful")}
                  {helpful ? ` (${helpful})` : ""}
                </Text>
              </Pressable>
            </View>
          );
        })}
        {hasMore ? <Button title={t("seeMore")} variant="ghost" size="sm" loading={loadingMore} onPress={() => void loadMore()} style={{ marginTop: spacing.sm }} /> : null}
      </Card>

      <ReviewSheet
        visible={writeOpen}
        materialId={materialId}
        onClose={() => setWriteOpen(false)}
        onSubmitted={() => {
          showToast(t("reviewSubmitted"));
          setExtra([]);
          setPage(1);
          reviews.reload();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: "row", gap: spacing.lg, alignItems: "center" },
  avgBox: { alignItems: "center", gap: 2, minWidth: 84 },
  avg: { fontSize: 36, fontWeight: "800", color: colors.text },
  distRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  distLabel: { ...typography.caption, width: 10, textAlign: "right" },
  bar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.neutralLight, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 4 },
  distCount: { ...typography.caption, width: 24, textAlign: "right" },
  empty: { alignItems: "center", paddingVertical: spacing.md },
  sortRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.neutralLight },
  sortChipActive: { backgroundColor: colors.primary },
  sortText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  sortTextActive: { color: "#fff" },
  review: { paddingTop: spacing.md, marginTop: spacing.sm },
  reviewBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  reviewHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 4 },
  verified: { flexDirection: "row", alignItems: "center", gap: 3 },
  verifiedText: { ...typography.caption, color: colors.success, fontWeight: "600" },
  reviewTitle: { ...typography.body, fontWeight: "700" },
  reviewBody: { ...typography.bodySmall, color: colors.text, marginTop: 2, marginBottom: 4 },
  reply: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryLight },
  replyTitle: { ...typography.label, color: colors.primary, marginBottom: 2 },
  helpfulBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm, alignSelf: "flex-start" },
  helpfulText: { ...typography.caption, color: colors.primary, fontWeight: "600" },
  fieldLabel: { ...typography.label, marginBottom: spacing.xs },
  error: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
});
