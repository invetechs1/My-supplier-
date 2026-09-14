import React, { useCallback, useMemo, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  SAUDI_CITIES,
  type BoqAnalysis,
  type BoqLineInput,
  type BoqLineResult,
  type BoqOffer,
  type BoqSupplierBreakdown,
} from "@mysupplier/shared";
import {
  Screen,
  Button,
  TextField,
  PickerField,
  PickerModal,
  PriceTile,
  StatusBadge,
  Card,
  SectionHeader,
  LoadingView,
  ErrorView,
  RequireAuth,
  type PickerOption,
} from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatSar } from "@/lib/format";
import { colors, radius, spacing, typography } from "@/theme";

const CITY_OPTIONS = SAUDI_CITIES.map((c) => ({ value: c, label: c }));
const CLOSE_OPTIONS = [
  { value: "3", label: "3 days" },
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
];

const SAMPLE_BOQ = [
  "Rebar 16mm, 25, ton",
  "1200 bags OPC cement 50kg",
  "Concrete hollow block 20cm, 5000, piece",
  "Washed sand, 60, m3",
  "Ready-mix concrete C30, 120, m3",
  "أسمنت بورتلاندي مقاوم للكبريتات، 400، كيس",
].join("\n");

const PLACEHOLDER = [
  "One item per line, e.g.",
  "Rebar 16mm, 25, ton",
  "1200 bags OPC cement 50kg",
  "بلوك أسمنتي 20 سم، 5000، حبة",
].join("\n");

function confidenceTone(c: number): { bg: string; fg: string; label: string } {
  if (c >= 0.8) return { bg: colors.successLight, fg: colors.success, label: "High match" };
  if (c >= 0.5) return { bg: colors.warningLight, fg: colors.warning, label: "Check match" };
  return { bg: colors.dangerLight, fg: colors.danger, label: "Low match" };
}

/** Convert analysis lines back to inputs, keeping the user's pinned matches. */
function toInputs(lines: BoqLineResult[], pins: Record<number, string>): BoqLineInput[] {
  return lines.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unit: l.unit || undefined,
    materialId: pins[l.index] ?? l.match?.material.id,
  }));
}

// Line card ---------------------------------------------------------------------

function OfferRow({ offer, unit, best }: { offer: BoqOffer; unit: string; best: boolean }) {
  return (
    <View style={styles.offerRow}>
      <View style={{ flex: 1 }}>
        <View style={styles.inline}>
          <Text style={styles.offerName} numberOfLines={1}>
            {offer.supplierName}
          </Text>
          {offer.verified ? <Ionicons name="checkmark-circle" size={14} color={colors.primary} /> : null}
          {best ? <Text style={styles.bestTag}>BEST</Text> : null}
        </View>
        <View style={[styles.inline, { marginTop: 3, flexWrap: "wrap" }]}>
          <StatusBadge status={offer.source} small />
          <Text style={typography.caption}>
            {offer.city} · min {offer.minQty} {unit} · {offer.leadTimeDays}d lead
          </Text>
        </View>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.offerPrice, best && { color: colors.success }]}>{formatSar(offer.price)}</Text>
        <Text style={typography.caption}>{formatSar(offer.lineTotal)} total</Text>
      </View>
    </View>
  );
}

function LineCard({ line, onChangeMatch }: { line: BoqLineResult; onChangeMatch: (line: BoqLineResult) => void }) {
  const [expanded, setExpanded] = useState(false);
  const match = line.match;
  const tone = match ? confidenceTone(match.confidence) : null;

  return (
    <Card style={{ paddingBottom: spacing.md }}>
      <Pressable onPress={() => setExpanded((e) => !e)}>
        <View style={styles.lineHead}>
          <View style={styles.lineIndex}>
            <Text style={styles.lineIndexText}>{line.index + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.lineDesc}>{line.description}</Text>
            <Text style={typography.caption}>
              {line.quantity} {line.unit}
              {line.unitMismatch ? "  · unit differs from catalogue" : ""}
            </Text>
          </View>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
        </View>

        {match && tone ? (
          <View style={styles.matchBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.matchName} numberOfLines={1}>
                {match.material.name}
              </Text>
              <Text style={typography.caption} numberOfLines={1}>
                {match.material.nameAr} · per {match.material.unit}
              </Text>
            </View>
            <View style={[styles.confBadge, { backgroundColor: tone.bg }]}>
              <Text style={[styles.confText, { color: tone.fg }]}>
                {Math.round(match.confidence * 100)}% · {tone.label}
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.matchBox, { backgroundColor: colors.dangerLight }]}>
            <Ionicons name="help-circle-outline" size={18} color={colors.danger} />
            <Text style={[typography.bodySmall, { color: colors.danger, flex: 1 }]}>
              No catalogue match. Pick a material to price this line.
            </Text>
          </View>
        )}

        {line.bestOffer ? (
          <View style={styles.bestRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.inline}>
                <Text style={typography.caption}>Best: </Text>
                <Text style={styles.bestName} numberOfLines={1}>
                  {line.bestOffer.supplierName}
                </Text>
                {line.bestOffer.verified ? <Ionicons name="checkmark-circle" size={14} color={colors.primary} /> : null}
              </View>
              <Text style={typography.caption}>
                {line.bestOffer.city} · {line.bestOffer.leadTimeDays}d lead · {line.supplierCount} supplier
                {line.supplierCount === 1 ? "" : "s"}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.lineTotal}>{formatSar(line.bestOffer.lineTotal)}</Text>
              <Text style={typography.caption}>
                {formatSar(line.bestOffer.price)} / {line.unit}
                {line.avgUnitPrice != null ? ` · avg ${formatSar(line.avgUnitPrice)}` : ""}
              </Text>
            </View>
          </View>
        ) : match ? (
          <Text style={[typography.caption, { marginTop: spacing.sm }]}>No supplier offers for this material yet.</Text>
        ) : null}
      </Pressable>

      {expanded ? (
        <View style={styles.offers}>
          {line.offers.length ? (
            <>
              <Text style={styles.offersTitle}>All offers ({line.offerCount})</Text>
              {line.offers.map((o, i) => (
                <OfferRow key={`${o.listingId}-${i}`} offer={o} unit={line.unit} best={o.listingId === line.bestOffer?.listingId} />
              ))}
            </>
          ) : null}
          <Button
            title={match ? "Change match" : "Choose material"}
            variant="outline"
            size="sm"
            icon="swap-horizontal-outline"
            onPress={() => onChangeMatch(line)}
            style={{ marginTop: spacing.md, alignSelf: "flex-start" }}
            disabled={line.alternatives.length === 0 && !match}
          />
          {line.alternatives.length === 0 && !match ? (
            <Text style={[typography.caption, { marginTop: spacing.xs }]}>No alternatives suggested. Rephrase the line and re-run.</Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

// Send-as-RFQ modal --------------------------------------------------------------

function SendRfqModal({
  visible,
  city,
  lines,
  onClose,
}: {
  visible: boolean;
  city: string;
  lines: BoqLineInput[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("BOQ quote request");
  const [deliveryCity, setDeliveryCity] = useState(city);
  const [closes, setCloses] = useState("7");
  const [cityOpen, setCityOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) return setError("Title is required");
    if (!deliveryCity) return setError("Select a delivery city");
    setError(null);
    setSubmitting(true);
    try {
      const rfq = await api.boqToRfq({
        title: title.trim(),
        deliveryCity,
        closesInDays: Number(closes),
        lines,
      });
      onClose();
      router.push(`/rfq/${rfq.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalSafe} edges={["top", "bottom"]}>
        <View style={styles.modalHeader}>
          <Text style={typography.h3}>Send as RFQ</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.modalBody}>
          <RequireAuth roles={["BUYER"]} message="Only buyer accounts can send RFQs to suppliers.">
            <Text style={[typography.bodySmall, { marginBottom: spacing.lg }]}>
              {lines.length} line{lines.length === 1 ? "" : "s"} will be sent to suppliers in {deliveryCity || "the selected city"}.
            </Text>
            <TextField label="Title" value={title} onChangeText={setTitle} />
            <PickerField label="Delivery city" value={deliveryCity} placeholder="Select city" onPress={() => setCityOpen(true)} />
            <PickerField label="Accept bids for" value={CLOSE_OPTIONS.find((o) => o.value === closes)?.label} onPress={() => setCloseOpen(true)} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Publish RFQ" size="lg" fullWidth loading={submitting} onPress={submit} />
          </RequireAuth>
        </View>
        <PickerModal visible={cityOpen} title="Delivery city" options={CITY_OPTIONS} value={deliveryCity} onSelect={setDeliveryCity} onClose={() => setCityOpen(false)} searchable />
        <PickerModal visible={closeOpen} title="Accept bids for" options={CLOSE_OPTIONS} value={closes} onSelect={setCloses} onClose={() => setCloseOpen(false)} />
      </SafeAreaView>
    </Modal>
  );
}

// Screen ------------------------------------------------------------------------

export default function BoqScreen() {
  const { isBuyer } = useAuth();
  const [text, setText] = useState("");
  const [city, setCity] = useState<string>("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);

  const [analysis, setAnalysis] = useState<BoqAnalysis | null>(null);
  const [pins, setPins] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"input" | "results">("input");

  const [altFor, setAltFor] = useState<BoqLineResult | null>(null);
  const [sendOpen, setSendOpen] = useState(false);

  const run = useCallback(
    async (body: { text?: string; lines?: BoqLineInput[] }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.boqAnalyze({ ...body, city: city || undefined, verifiedOnly });
        setAnalysis(res);
        setMode("results");
      } catch (err) {
        setError(getErrorMessage(err));
        if (!analysis) setMode("input");
      } finally {
        setLoading(false);
      }
    },
    [city, verifiedOnly, analysis],
  );

  const research = () => {
    if (!text.trim()) {
      setError("Paste at least one BOQ line first.");
      return;
    }
    setPins({});
    run({ text: text.trim() });
  };

  const changeMatch = (line: BoqLineResult, materialId: string) => {
    if (!analysis) return;
    const nextPins = { ...pins, [line.index]: materialId };
    setPins(nextPins);
    run({ lines: toInputs(analysis.lines, nextPins) });
  };

  const rfqLines = useMemo(() => (analysis ? toInputs(analysis.lines, pins) : []), [analysis, pins]);

  const altOptions: PickerOption[] = useMemo(() => {
    if (!altFor) return [];
    const opts: PickerOption[] = [];
    const seen = new Set<string>();
    [...(altFor.match ? [altFor.match] : []), ...altFor.alternatives].forEach((a) => {
      if (seen.has(a.material.id)) return;
      seen.add(a.material.id);
      opts.push({
        value: a.material.id,
        label: a.material.name,
        subtitle: `${a.material.nameAr} · ${a.material.unit} · ${Math.round(a.confidence * 100)}% match`,
      });
    });
    return opts;
  }, [altFor]);

  // Input mode --------------------------------------------------------------------
  if (mode === "input" || !analysis) {
    return (
      <Screen scroll keyboard edges={["bottom", "left", "right"]}>
        <Text style={styles.intro}>
          Paste your bill of quantities and we will match every line to the catalogue, compare all supplier prices and show
          where to buy cheapest.
        </Text>
        <View style={styles.labelRow}>
          <Text style={typography.label}>Paste your BOQ</Text>
          <Pressable onPress={() => setText(SAMPLE_BOQ)} hitSlop={8}>
            <Text style={styles.link}>Use sample</Text>
          </Pressable>
        </View>
        <TextField
          value={text}
          onChangeText={setText}
          multiline
          placeholder={PLACEHOLDER}
          style={{ minHeight: 180 }}
          autoCapitalize="none"
          autoCorrect={false}
          hint="Supports English and Arabic, CSV-style 'name, qty, unit' or free text like '25 ton rebar 16mm'."
        />
        <PickerField label="Delivery city (optional)" value={city} placeholder="Any city" onPress={() => setCityOpen(true)} />
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={typography.body}>Verified suppliers only</Text>
            <Text style={typography.caption}>Exclude unverified companies and market reference prices</Text>
          </View>
          <Switch value={verifiedOnly} onValueChange={setVerifiedOnly} trackColor={{ true: colors.primary }} />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Research prices" icon="analytics-outline" size="lg" fullWidth loading={loading} onPress={research} />
        {analysis ? (
          <Button title="Back to results" variant="ghost" onPress={() => setMode("results")} style={{ marginTop: spacing.sm }} />
        ) : null}
        <PickerModal
          visible={cityOpen}
          title="Delivery city"
          options={CITY_OPTIONS}
          value={city}
          onSelect={setCity}
          onClose={() => setCityOpen(false)}
          searchable
          allowClear
          clearLabel="Any city"
        />
      </Screen>
    );
  }

  // Results mode ------------------------------------------------------------------
  const { summary } = analysis;
  const best = summary.bestSingleSupplier;

  return (
    <Screen scroll edges={["bottom", "left", "right"]}>
      {loading ? (
        <View style={styles.overlay}>
          <LoadingView message="Re-pricing your BOQ..." />
        </View>
      ) : null}

      <View style={styles.resultsHead}>
        <View style={{ flex: 1 }}>
          <Text style={typography.h2}>Price research</Text>
          <Text style={typography.caption}>
            {analysis.lineCount} lines · {analysis.matchedLines} matched
            {analysis.unmatchedLines ? ` · ${analysis.unmatchedLines} unmatched` : ""}
            {analysis.city ? ` · ${analysis.city}` : " · all cities"}
            {verifiedOnly ? " · verified only" : ""}
          </Text>
        </View>
        <Button title="Edit BOQ" variant="outline" size="sm" icon="create-outline" onPress={() => setMode("input")} />
      </View>

      {error ? <ErrorView message={error} onRetry={() => run({ lines: rfqLines })} style={{ minHeight: 120 }} /> : null}

      <View style={styles.tiles}>
        <PriceTile label="Cheapest total" value={formatSar(summary.cheapestTotal)} sub={`${summary.distinctSuppliersInCheapest} suppliers`} tone="primary" />
        <PriceTile label="Average total" value={formatSar(summary.averageTotal)} sub={`high ${formatSar(summary.highestTotal)}`} />
        <PriceTile
          label="You save"
          value={formatSar(summary.savingsVsAverage)}
          sub={summary.averageTotal ? `${((summary.savingsVsAverage / summary.averageTotal) * 100).toFixed(0)}% vs average` : undefined}
          tone="accent"
        />
        <PriceTile
          label="Best single supplier"
          value={best ? best.supplierName : "—"}
          sub={best ? `${Math.round(best.coveragePct)}% coverage · ${formatSar(best.total)}` : "No supplier covers your lines"}
        />
      </View>

      <View style={styles.actions}>
        <Button
          title={isBuyer ? "Send as RFQ" : "Send as RFQ (buyer login)"}
          icon="paper-plane-outline"
          onPress={() => setSendOpen(true)}
          style={{ flex: 1 }}
        />
      </View>

      <SectionHeader title={`Lines (${analysis.lines.length})`} />
      {analysis.lines.map((line) => (
        <LineCard key={line.index} line={line} onChangeMatch={setAltFor} />
      ))}

      <SectionHeader title="Where to buy" />
      {analysis.suppliers.length === 0 ? (
        <Card>
          <Text style={typography.bodySmall}>No suppliers found for these lines{city ? ` in ${city}` : ""}.</Text>
        </Card>
      ) : (
        analysis.suppliers.map((s: BoqSupplierBreakdown) => {
          const isBest = best?.supplierId === s.supplierId;
          return (
            <Card key={s.supplierId} style={isBest ? { ...styles.supplierCard, ...styles.supplierBest } : styles.supplierCard}>
              <View style={{ flex: 1 }}>
                <View style={styles.inline}>
                  <Text style={styles.supplierName} numberOfLines={1}>
                    {s.supplierName}
                  </Text>
                  {s.verified ? <Ionicons name="checkmark-circle" size={15} color={colors.primary} /> : null}
                  {isBest ? (
                    <View style={styles.bestPill}>
                      <Text style={styles.bestPillText}>Best single supplier</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={typography.caption}>
                  {s.city} · {s.linesCovered}/{analysis.lineCount} lines · avg {s.avgLeadTimeDays}d lead
                </Text>
                <View style={styles.coverageTrack}>
                  <View style={[styles.coverageFill, { width: `${Math.min(100, Math.max(0, s.coveragePct))}%` }, isBest && { backgroundColor: colors.accent }]} />
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.supplierTotal}>{formatSar(s.total)}</Text>
                <Text style={typography.caption}>{Math.round(s.coveragePct)}% coverage</Text>
              </View>
            </Card>
          );
        })
      )}

      <View style={[styles.actions, { marginTop: spacing.lg }]}>
        <Button title="Edit BOQ" variant="outline" onPress={() => setMode("input")} style={{ flex: 1 }} />
        <Button title="Send as RFQ" icon="paper-plane-outline" onPress={() => setSendOpen(true)} style={{ flex: 1 }} />
      </View>
      <Text style={[typography.caption, { textAlign: "center", marginTop: spacing.md }]}>
        Prices generated {new Date(analysis.generatedAt).toLocaleString()}. Totals use the cheapest offer per line.
      </Text>

      <PickerModal
        visible={altFor !== null}
        title={altFor ? `Match for line ${altFor.index + 1}` : "Match"}
        options={altOptions}
        value={altFor ? (pins[altFor.index] ?? altFor.match?.material.id ?? null) : null}
        onSelect={(materialId) => {
          if (altFor) changeMatch(altFor, materialId);
        }}
        onClose={() => setAltFor(null)}
        searchable={altOptions.length > 6}
      />
      <SendRfqModal visible={sendOpen} city={city || analysis.city || ""} lines={rfqLines} onClose={() => setSendOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { ...typography.bodySmall, marginVertical: spacing.lg },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  link: { color: colors.primary, fontWeight: "600", fontSize: 13 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg, paddingVertical: spacing.sm },
  error: { color: colors.danger, fontSize: 13, marginBottom: spacing.md },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: "rgba(246,247,249,0.85)",
  },
  resultsHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  inline: { flexDirection: "row", alignItems: "center", gap: 4 },
  lineHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  lineIndex: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.neutralLight, alignItems: "center", justifyContent: "center", marginTop: 2 },
  lineIndexText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  lineDesc: { ...typography.body, fontWeight: "600" },
  matchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  matchName: { ...typography.bodySmall, color: colors.text, fontWeight: "600" },
  confBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  confText: { fontSize: 11, fontWeight: "700" },
  bestRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  bestName: { ...typography.bodySmall, color: colors.text, fontWeight: "600", flexShrink: 1 },
  lineTotal: { fontSize: 16, fontWeight: "700", color: colors.text },
  offers: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  offersTitle: { ...typography.label, marginBottom: spacing.xs },
  offerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  offerName: { ...typography.bodySmall, color: colors.text, fontWeight: "500", flexShrink: 1 },
  offerPrice: { fontSize: 14, fontWeight: "700", color: colors.text },
  bestTag: { fontSize: 10, fontWeight: "800", color: colors.success, marginLeft: 4 },
  supplierCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  supplierBest: { borderWidth: 1.5, borderColor: colors.accent },
  supplierName: { ...typography.body, fontWeight: "600", flexShrink: 1 },
  supplierTotal: { fontSize: 16, fontWeight: "700", color: colors.primary },
  bestPill: { backgroundColor: colors.accentLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
  bestPillText: { fontSize: 10, fontWeight: "700", color: "#B07A00" },
  coverageTrack: { height: 6, backgroundColor: colors.neutralLight, borderRadius: 3, marginTop: spacing.sm, overflow: "hidden" },
  coverageFill: { height: 6, backgroundColor: colors.primary, borderRadius: 3 },
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalBody: { flex: 1, padding: spacing.lg },
});
