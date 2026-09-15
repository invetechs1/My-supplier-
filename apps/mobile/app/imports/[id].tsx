import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  SAUDI_CITIES,
  UNITS,
  type Material,
  type PriceImportRow,
  type PublishImportResult,
} from "@mysupplier/shared";
import {
  Screen,
  Button,
  Card,
  PickerModal,
  MaterialSearchModal,
  RequireAuth,
  StatusBadge,
  LoadingView,
  ErrorView,
  EmptyState,
} from "@/components";
import { api, getErrorMessage, type ImportRowPatch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatDateTime } from "@/lib/format";
import { importKindLabel } from "@/lib/imports";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography, shadow } from "@/theme";

const CITY_OPTIONS = SAUDI_CITIES.map((c) => ({ value: c, label: c }));
const UNIT_OPTIONS = UNITS.map((u) => ({ value: u, label: u }));
const MIN_CONFIDENCE = 0.8;

type Filter = "all" | "matched" | "review" | "unmatched" | "approved" | "rejected";

function rowBucket(r: PriceImportRow): "matched" | "review" | "unmatched" {
  if (!r.materialId) return "unmatched";
  return r.confidence >= MIN_CONFIDENCE ? "matched" : "review";
}

/** Cross-platform confirm: RN Alert has no buttons on web, so fall back to window.confirm. */
function confirm(title: string, message: string, confirmLabel: string, destructive = false): Promise<boolean> {
  if (Platform.OS === "web") {
    const w = globalThis as unknown as { confirm?: (msg: string) => boolean };
    return Promise.resolve(w.confirm ? w.confirm(`${title}\n\n${message}`) : true);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
    ]);
  });
}

function ConfidenceBadge({ confidence, matched }: { confidence: number; matched: boolean }) {
  let bg: string = colors.neutralLight;
  let fg: string = colors.textSecondary;
  let label = "No match";
  if (matched) {
    label = `${Math.round(confidence * 100)}%`;
    if (confidence >= 0.8) {
      bg = colors.successLight;
      fg = colors.success;
    } else if (confidence >= 0.5) {
      bg = colors.warningLight;
      fg = colors.warning;
    } else {
      bg = colors.dangerLight;
      fg = colors.danger;
    }
  }
  return (
    <View style={[styles.confBadge, { backgroundColor: bg }]}>
      <Ionicons name={matched ? "git-compare-outline" : "help-circle-outline"} size={12} color={fg} />
      <Text style={[styles.confText, { color: fg }]}>{label}</Text>
    </View>
  );
}

function SummaryChip({
  label,
  count,
  color,
  active,
  onPress,
}: {
  label: string;
  count: number;
  color: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.sumChip, active && { borderColor: color, backgroundColor: colors.surface }]}>
      <View style={[styles.sumDot, { backgroundColor: color }]} />
      <Text style={[styles.sumCount, active && { color }]}>{count}</Text>
      <Text style={styles.sumLabel}>{label}</Text>
    </Pressable>
  );
}

interface RowCardProps {
  row: PriceImportRow;
  editable: boolean;
  busy: boolean;
  onPatch: (patch: ImportRowPatch) => void;
  onChangeMatch: () => void;
  onPickUnit: () => void;
  onPickCity: () => void;
  t: (k: "changeMatch" | "createNewItem") => string;
}

const RowCard = React.memo(function RowCard({ row, editable, busy, onPatch, onChangeMatch, onPickUnit, onPickCity, t }: RowCardProps) {
  const [priceDraft, setPriceDraft] = useState(row.price != null ? String(row.price) : "");
  const [editingPrice, setEditingPrice] = useState(false);
  // Sync the draft when the server value changes while we are not typing.
  const serverPrice = row.price != null ? String(row.price) : "";
  React.useEffect(() => {
    if (!editingPrice) setPriceDraft(serverPrice);
  }, [serverPrice, editingPrice]);

  const commitPrice = () => {
    setEditingPrice(false);
    const cleaned = priceDraft.replace(/[^0-9.]/g, "");
    if (cleaned === "" && row.price == null) return;
    const n = Number(cleaned);
    if (cleaned === "" || Number.isNaN(n) || n < 0) {
      setPriceDraft(serverPrice);
      return;
    }
    if (row.price != null && Math.abs(n - row.price) < 1e-9) return;
    onPatch({ price: n });
  };

  const rawMeta = [row.rawUnit, row.rawPrice, row.rawCity, row.brand].filter(Boolean).join(" · ");
  const material = row.material;
  const isRejected = row.status === "REJECTED";
  const locked = !editable || busy || row.status === "PUBLISHED";

  return (
    <Card style={isRejected ? { ...styles.rowCard, opacity: 0.6 } : styles.rowCard}>
      <View style={styles.rowTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rawName}>{row.rawName}</Text>
          {rawMeta ? <Text style={styles.rawMeta}>{rawMeta}</Text> : null}
          {row.notes ? <Text style={styles.rawMeta}>{row.notes}</Text> : null}
        </View>
        {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <StatusBadge status={row.status} small />}
      </View>

      <View style={styles.matchBox}>
        <View style={{ flex: 1 }}>
          {material ? (
            <>
              <Text style={styles.matchName} numberOfLines={2}>
                {material.name}
              </Text>
              <Text style={styles.matchAr} numberOfLines={1}>
                {material.nameAr}
                {material.sku ? ` · ${material.sku}` : ""}
                {material.unit ? ` · ${material.unit}` : ""}
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.matchName, { color: colors.textSecondary }]}>No match in the catalogue</Text>
              <Text style={styles.matchAr}>Search for the right item or create it as a new one.</Text>
            </>
          )}
        </View>
        <ConfidenceBadge confidence={row.confidence} matched={Boolean(material)} />
      </View>

      {row.alternatives?.length && !locked ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.altRow}>
          {row.alternatives.map((alt) => {
            const active = alt.material.id === row.materialId;
            return (
              <Pressable
                key={alt.material.id}
                onPress={() => !active && onPatch({ materialId: alt.material.id })}
                style={[styles.altChip, active && styles.altChipActive]}
              >
                <Text style={[styles.altText, active && { color: "#fff" }]} numberOfLines={1}>
                  {alt.material.name}
                </Text>
                <Text style={[styles.altPct, active && { color: "rgba(255,255,255,0.85)" }]}>{Math.round(alt.confidence * 100)}%</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {!locked ? (
        <Pressable onPress={onChangeMatch} style={styles.linkBtn} hitSlop={6}>
          <Ionicons name="search-outline" size={15} color={colors.primary} />
          <Text style={styles.linkText}>{t("changeMatch")}</Text>
        </Pressable>
      ) : null}

      <View style={styles.editRow}>
        <View style={[styles.editField, { flex: 1.2 }]}>
          <Text style={styles.editLabel}>Price (SAR)</Text>
          <TextInput
            value={priceDraft}
            editable={!locked}
            onFocus={() => setEditingPrice(true)}
            onChangeText={(v) => setPriceDraft(v.replace(/[^0-9.]/g, ""))}
            onBlur={commitPrice}
            onSubmitEditing={commitPrice}
            keyboardType="decimal-pad"
            placeholder="—"
            placeholderTextColor={colors.textMuted}
            style={[styles.editInput, locked && styles.editDisabled]}
          />
        </View>
        <Pressable onPress={onPickUnit} disabled={locked} style={[styles.editField, { flex: 1 }]}>
          <Text style={styles.editLabel}>Unit</Text>
          <View style={[styles.editInput, styles.editSelect, locked && styles.editDisabled]}>
            <Text style={styles.editSelectText} numberOfLines={1}>
              {row.unit || "—"}
            </Text>
            {!locked ? <Ionicons name="chevron-down" size={14} color={colors.textMuted} /> : null}
          </View>
        </Pressable>
        <Pressable onPress={onPickCity} disabled={locked} style={[styles.editField, { flex: 1.3 }]}>
          <Text style={styles.editLabel}>City</Text>
          <View style={[styles.editInput, styles.editSelect, locked && styles.editDisabled]}>
            <Text style={[styles.editSelectText, !row.city && { color: colors.textMuted }]} numberOfLines={1}>
              {row.city || "Any"}
            </Text>
            {!locked ? <Ionicons name="chevron-down" size={14} color={colors.textMuted} /> : null}
          </View>
        </Pressable>
      </View>

      {!row.materialId ? (
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>{t("createNewItem")}</Text>
            <Text style={typography.caption}>Adds “{row.rawName}” to the catalogue when published.</Text>
          </View>
          <Switch
            value={row.createMaterial}
            disabled={locked}
            onValueChange={(v) => onPatch({ createMaterial: v })}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor="#fff"
          />
        </View>
      ) : null}

      {editable && row.status !== "PUBLISHED" ? (
        <View style={styles.actions}>
          {row.status !== "APPROVED" ? (
            <Button
              title="Approve"
              icon="checkmark"
              size="sm"
              variant="secondary"
              disabled={busy || (!row.materialId && !row.createMaterial) || row.price == null}
              onPress={() => onPatch({ status: "APPROVED" })}
              style={{ flex: 1 }}
            />
          ) : (
            <Button title="Approved" icon="checkmark-done" size="sm" variant="primary" disabled style={{ flex: 1 }} />
          )}
          {row.status !== "REJECTED" ? (
            <Button
              title="Reject"
              icon="close"
              size="sm"
              variant="ghost"
              textStyle={{ color: colors.danger }}
              disabled={busy}
              onPress={() => onPatch({ status: "REJECTED" })}
              style={{ flex: 1 }}
            />
          ) : (
            <Button title="Restore" icon="refresh" size="sm" variant="outline" disabled={busy} onPress={() => onPatch({ status: "SUGGESTED" })} style={{ flex: 1 }} />
          )}
        </View>
      ) : null}
      {editable && row.status !== "APPROVED" && row.status !== "PUBLISHED" && row.materialId && row.price == null ? (
        <Text style={[typography.caption, { color: colors.warning, marginTop: spacing.xs }]}>Enter a price before approving.</Text>
      ) : null}
    </Card>
  );
});

function ImportReviewContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const { data, loading, error, refreshing, reload, refresh, setData } = useApi(() => api.importDetail(String(id)), [id], Boolean(id));

  const [filter, setFilter] = useState<Filter>("all");
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"approve" | "publish" | "reject" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [includeSuggested, setIncludeSuggested] = useState(false);
  const [result, setResult] = useState<PublishImportResult | null>(null);
  const [matchTarget, setMatchTarget] = useState<string | null>(null);
  const [unitTarget, setUnitTarget] = useState<string | null>(null);
  const [cityTarget, setCityTarget] = useState<string | null>(null);

  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const counts = useMemo(() => {
    const c = { matched: 0, review: 0, unmatched: 0, approved: 0, rejected: 0, suggestedConfident: 0 };
    rows.forEach((r) => {
      c[rowBucket(r)] += 1;
      if (r.status === "APPROVED") c.approved += 1;
      if (r.status === "REJECTED") c.rejected += 1;
      if (r.status === "SUGGESTED" && r.materialId && r.confidence >= MIN_CONFIDENCE) c.suggestedConfident += 1;
    });
    return c;
  }, [rows]);

  const visibleRows = useMemo(() => {
    switch (filter) {
      case "matched":
      case "review":
      case "unmatched":
        return rows.filter((r) => rowBucket(r) === filter);
      case "approved":
        return rows.filter((r) => r.status === "APPROVED");
      case "rejected":
        return rows.filter((r) => r.status === "REJECTED");
      default:
        return rows;
    }
  }, [rows, filter]);

  const editable = data?.status === "REVIEW";

  const replaceRow = useCallback(
    (next: PriceImportRow) => {
      setData((prev) => (prev ? { ...prev, rows: (prev.rows ?? []).map((r) => (r.id === next.id ? { ...r, ...next } : r)) } : prev));
    },
    [setData],
  );

  const patchRow = useCallback(
    async (rowId: string, patch: ImportRowPatch) => {
      if (!data) return;
      setBusyRow(rowId);
      setActionError(null);
      try {
        const updated = await api.updateImportRow(data.id, rowId, patch);
        replaceRow(updated);
      } catch (err) {
        setActionError(getErrorMessage(err));
      } finally {
        setBusyRow(null);
      }
    },
    [data, replaceRow],
  );

  const selectMaterial = (m: Material) => {
    if (!matchTarget) return;
    const rowId = matchTarget;
    setMatchTarget(null);
    // Optimistic material display until the PATCH returns.
    setData((prev) =>
      prev ? { ...prev, rows: (prev.rows ?? []).map((r) => (r.id === rowId ? { ...r, material: m, materialId: m.id, confidence: 1 } : r)) } : prev,
    );
    void patchRow(rowId, { materialId: m.id });
  };

  const approveAll = async () => {
    if (!data) return;
    setBusyAction("approve");
    setActionError(null);
    try {
      const updated = await api.approveAllRows(data.id, MIN_CONFIDENCE);
      setData((prev) => ({ ...(prev ?? updated), ...updated, rows: updated.rows ?? prev?.rows ?? [] }));
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const publish = async () => {
    if (!data) return;
    setPublishOpen(false);
    setBusyAction("publish");
    setActionError(null);
    try {
      const res = await api.publishImport(data.id, { includeSuggested, minConfidence: MIN_CONFIDENCE });
      setResult(res);
      setData((prev) => ({ ...(prev ?? res.import), ...res.import, rows: res.import.rows ?? prev?.rows ?? [] }));
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const reject = async () => {
    if (!data) return;
    const ok = await confirm("Reject this import?", "None of these prices will be published. You can always upload the document again.", "Reject", true);
    if (!ok) return;
    setBusyAction("reject");
    setActionError(null);
    try {
      const updated = await api.rejectImport(data.id);
      setData((prev) => ({ ...(prev ?? updated), ...updated, rows: updated.rows ?? prev?.rows ?? [] }));
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  if (!id) return <ErrorView message="Missing import id" />;
  if (loading && !data) return <LoadingView message="Loading import…" />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return <ErrorView message="Import not found" onRetry={reload} />;

  const isBuyer = user?.role === "BUYER";
  const isSupplier = user?.role === "SUPPLIER";
  const publishable = editable && (counts.approved > 0 || counts.suggestedConfident > 0);

  const header = (
    <View>
      <Card>
        <View style={styles.headTop}>
          <View style={{ flex: 1 }}>
            <Text style={typography.h3}>{data.sourceName}</Text>
            <Text style={styles.headMeta}>
              {importKindLabel(data.kind)}
              {data.fileName ? ` · ${data.fileName}` : ""}
            </Text>
          </View>
          <StatusBadge status={data.status} />
        </View>
        <View style={styles.headChips}>
          <View style={styles.pill}>
            <Ionicons name="list-outline" size={12} color={colors.textSecondary} />
            <Text style={styles.pillText}>{data.extractedCount} lines extracted</Text>
          </View>
          {data.publishedCount ? (
            <View style={[styles.pill, { backgroundColor: colors.successLight }]}>
              <Ionicons name="cloud-done-outline" size={12} color={colors.success} />
              <Text style={[styles.pillText, { color: colors.success }]}>{data.publishedCount} published</Text>
            </View>
          ) : null}
          <View style={[styles.pill, data.aiUsed ? { backgroundColor: colors.purpleLight } : null]}>
            <Ionicons name={data.aiUsed ? "sparkles" : "code-slash-outline"} size={12} color={data.aiUsed ? colors.purple : colors.textSecondary} />
            <Text style={[styles.pillText, data.aiUsed ? { color: colors.purple } : null]}>
              {data.aiUsed ? `AI${data.model ? ` · ${data.model}` : ""}` : "Rule-based parsing"}
            </Text>
          </View>
          {data.city ? (
            <View style={styles.pill}>
              <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.pillText}>{data.city}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.headFoot}>
          {data.supplierName ? `From ${data.supplierName} · ` : ""}
          {data.quotationDate ? `Quoted ${formatDate(data.quotationDate)} · ` : ""}
          Uploaded {formatDateTime(data.createdAt)}
          {data.uploadedBy && data.uploadedBy.id !== user?.id ? ` by ${data.uploadedBy.name}` : ""}
        </Text>
        {data.status === "FAILED" && data.error ? (
          <View style={styles.failBox}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.failText}>{data.error}</Text>
          </View>
        ) : null}
      </Card>

      {result ? (
        <Card style={styles.resultCard}>
          <View style={styles.resultHead}>
            <Ionicons name="checkmark-circle" size={28} color={colors.success} />
            <Text style={[typography.h3, { flex: 1 }]}>{isBuyer ? "Quotation added to the market view" : "Prices published"}</Text>
          </View>
          <View style={styles.resultStats}>
            <View style={styles.resultStat}>
              <Text style={styles.resultNum}>{result.published}</Text>
              <Text style={typography.caption}>published</Text>
            </View>
            <View style={styles.resultStat}>
              <Text style={styles.resultNum}>{result.skipped}</Text>
              <Text style={typography.caption}>skipped</Text>
            </View>
            <View style={styles.resultStat}>
              <Text style={styles.resultNum}>{result.createdMaterials}</Text>
              <Text style={typography.caption}>new items</Text>
            </View>
          </View>
          <View style={styles.resultActions}>
            {isSupplier ? (
              <Button title={t("myPriceList")} icon="pricetags-outline" onPress={() => router.replace("/supplier/prices")} style={{ flex: 1 }} />
            ) : (
              <Button title={t("search")} icon="search-outline" onPress={() => router.replace("/(tabs)/search")} style={{ flex: 1 }} />
            )}
            <Button title={isBuyer ? t("myQuotations") : t("myImports")} variant="outline" onPress={() => router.replace("/imports")} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}

      {rows.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sumRow}>
          <SummaryChip label="all" count={rows.length} color={colors.text} active={filter === "all"} onPress={() => setFilter("all")} />
          <SummaryChip label="matched ≥80%" count={counts.matched} color={colors.success} active={filter === "matched"} onPress={() => setFilter("matched")} />
          <SummaryChip label={t("needsReview").toLowerCase()} count={counts.review} color={colors.warning} active={filter === "review"} onPress={() => setFilter("review")} />
          <SummaryChip label="unmatched" count={counts.unmatched} color={colors.danger} active={filter === "unmatched"} onPress={() => setFilter("unmatched")} />
          <SummaryChip label="approved" count={counts.approved} color={colors.primary} active={filter === "approved"} onPress={() => setFilter("approved")} />
          <SummaryChip label="rejected" count={counts.rejected} color={colors.textMuted} active={filter === "rejected"} onPress={() => setFilter("rejected")} />
        </ScrollView>
      ) : null}

      {editable ? (
        <View style={styles.toolbar}>
          <Button
            title={t("approveAll")}
            icon="checkmark-done-outline"
            size="sm"
            variant="secondary"
            loading={busyAction === "approve"}
            disabled={busyAction !== null || counts.suggestedConfident === 0}
            onPress={approveAll}
          />
          <Button
            title={t("publish")}
            icon="cloud-upload-outline"
            size="sm"
            loading={busyAction === "publish"}
            disabled={busyAction !== null || !publishable}
            onPress={() => setPublishOpen(true)}
          />
          <Button
            title="Reject"
            icon="trash-outline"
            size="sm"
            variant="ghost"
            textStyle={{ color: colors.danger }}
            loading={busyAction === "reject"}
            disabled={busyAction !== null}
            onPress={reject}
          />
        </View>
      ) : null}

      {actionError ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{actionError}</Text>
          <Pressable onPress={() => setActionError(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color={colors.danger} />
          </Pressable>
        </View>
      ) : null}

      {editable && rows.length ? (
        <Text style={styles.hint}>
          Check each line, fix the price or match where needed, then approve. Only approved rows are published unless you include suggested matches.
        </Text>
      ) : null}
    </View>
  );

  return (
    <Screen padded={false} edges={["bottom", "left", "right"]}>
      <Stack.Screen options={{ title: data.kind === "BUYER_QUOTATION" ? "Review quotation" : "Review import" }} />
      <FlatList
        data={visibleRows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        refreshing={refreshing}
        onRefresh={refresh}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          rows.length === 0 ? (
            <EmptyState
              icon="document-outline"
              title={data.status === "FAILED" ? "Nothing could be read" : "No lines extracted"}
              message={data.status === "PROCESSING" ? "Still processing — pull to refresh." : "Try a clearer photo, a PDF, or paste the prices as text."}
              actionTitle="Try again"
              onAction={() => router.replace("/imports/new")}
            />
          ) : (
            <EmptyState icon="filter-outline" title="No rows in this filter" actionTitle="Show all" onAction={() => setFilter("all")} />
          )
        }
        renderItem={({ item }) => (
          <RowCard
            row={item}
            editable={Boolean(editable)}
            busy={busyRow === item.id}
            onPatch={(patch) => void patchRow(item.id, patch)}
            onChangeMatch={() => setMatchTarget(item.id)}
            onPickUnit={() => setUnitTarget(item.id)}
            onPickCity={() => setCityTarget(item.id)}
            t={t}
          />
        )}
      />

      <MaterialSearchModal visible={matchTarget !== null} onClose={() => setMatchTarget(null)} onSelect={selectMaterial} />
      <PickerModal
        visible={unitTarget !== null}
        title="Unit"
        options={UNIT_OPTIONS}
        value={rows.find((r) => r.id === unitTarget)?.unit ?? null}
        onSelect={(u) => {
          if (unitTarget) void patchRow(unitTarget, { unit: u });
        }}
        onClose={() => setUnitTarget(null)}
      />
      <PickerModal
        visible={cityTarget !== null}
        title="City"
        options={CITY_OPTIONS}
        value={rows.find((r) => r.id === cityTarget)?.city ?? null}
        onSelect={(c) => {
          if (cityTarget) void patchRow(cityTarget, { city: c || null });
        }}
        onClose={() => setCityTarget(null)}
        searchable
        allowClear
        clearLabel={data.city ? `Import default (${data.city})` : "Any city"}
      />

      <Modal visible={publishOpen} transparent animationType="fade" onRequestClose={() => setPublishOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPublishOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={typography.h3}>{isBuyer ? "Publish this quotation?" : "Publish these prices?"}</Text>
            <Text style={[typography.bodySmall, { marginTop: spacing.xs }]}>
              {isSupplier
                ? "Approved rows will create or update your price list. Buyers see them immediately."
                : isBuyer
                  ? `Approved rows are added as quoted prices from ${data.supplierName ?? data.sourceName} so you and other buyers can compare.`
                  : "Approved rows are published as market prices."}
            </Text>
            <View style={styles.sheetStats}>
              <Text style={typography.body}>
                <Text style={{ fontWeight: "700" }}>{counts.approved}</Text> approved
              </Text>
              <Text style={typography.body}>
                <Text style={{ fontWeight: "700" }}>{counts.suggestedConfident}</Text> suggested ≥ 80%
              </Text>
            </View>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Include suggested matches ≥ 80%</Text>
                <Text style={typography.caption}>Publishes confident matches you have not approved yet.</Text>
              </View>
              <Switch value={includeSuggested} onValueChange={setIncludeSuggested} trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#fff" />
            </View>
            <View style={styles.sheetActions}>
              <Button title="Cancel" variant="outline" onPress={() => setPublishOpen(false)} style={{ flex: 1 }} />
              <Button
                title={`${t("publish")} ${counts.approved + (includeSuggested ? counts.suggestedConfident : 0)}`}
                onPress={publish}
                disabled={counts.approved + (includeSuggested ? counts.suggestedConfident : 0) === 0}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

export default function ImportReviewScreen() {
  return (
    <RequireAuth message="Log in to review imported prices.">
      <ImportReviewContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  headTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  headMeta: { ...typography.caption, marginTop: 2 },
  headChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.md },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.neutralLight, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  headFoot: { ...typography.caption, marginTop: spacing.md },
  failBox: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start", backgroundColor: colors.dangerLight, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  failText: { ...typography.bodySmall, color: colors.danger, flex: 1 },
  resultCard: { borderWidth: 1, borderColor: colors.successLight },
  resultHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  resultStats: { flexDirection: "row", marginTop: spacing.md, backgroundColor: colors.background, borderRadius: radius.md, paddingVertical: spacing.sm },
  resultStat: { flex: 1, alignItems: "center" },
  resultNum: { fontSize: 20, fontWeight: "700", color: colors.text },
  resultActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  sumRow: { gap: spacing.sm, paddingBottom: spacing.md },
  sumChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background },
  sumDot: { width: 8, height: 8, borderRadius: 4 },
  sumCount: { fontSize: 14, fontWeight: "700", color: colors.text },
  sumLabel: { fontSize: 12, color: colors.textSecondary },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  errorBox: { flexDirection: "row", gap: spacing.sm, alignItems: "center", backgroundColor: colors.dangerLight, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  errorText: { ...typography.bodySmall, color: colors.danger, flex: 1 },
  hint: { ...typography.caption, marginBottom: spacing.md, lineHeight: 17 },
  rowCard: { padding: spacing.md },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  rawName: { ...typography.body, fontWeight: "600" },
  rawMeta: { ...typography.caption, marginTop: 2 },
  matchBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md },
  matchName: { ...typography.body, fontWeight: "500", color: colors.primary },
  matchAr: { ...typography.caption, marginTop: 2 },
  confBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  confText: { fontSize: 12, fontWeight: "700" },
  altRow: { gap: spacing.xs, paddingTop: spacing.sm },
  altChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, maxWidth: 220 },
  altChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  altText: { fontSize: 12, color: colors.text, flexShrink: 1 },
  altPct: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: spacing.sm },
  linkText: { fontSize: 13, fontWeight: "600", color: colors.primary },
  editRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  editField: {},
  editLabel: { ...typography.caption, fontWeight: "600", marginBottom: 4 },
  editInput: { height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.sm, fontSize: 14, color: colors.text, backgroundColor: colors.surface },
  editSelect: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  editSelectText: { fontSize: 14, color: colors.text, flexShrink: 1 },
  editDisabled: { backgroundColor: colors.neutralLight, color: colors.textSecondary },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  switchLabel: { ...typography.body, fontWeight: "500" },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  backdrop: { flex: 1, backgroundColor: "rgba(17,24,39,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, paddingBottom: spacing.xxl, ...shadow.card },
  sheetStats: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.md, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md },
  sheetActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl },
});
