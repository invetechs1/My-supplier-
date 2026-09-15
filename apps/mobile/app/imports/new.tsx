import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { SAUDI_CITIES, type ImportKind } from "@mysupplier/shared";
import { Screen, Button, TextField, PickerField, PickerModal, RequireAuth, Card } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { isValidYmd } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography, shadow } from "@/theme";

const CITY_OPTIONS = SAUDI_CITIES.map((c) => ({ value: c, label: c }));

const SPREADSHEET_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/comma-separated-values",
];
const PDF_TYPE = "application/pdf";

interface PickedFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
  /** Web only: the File object from the picker (no need to re-fetch the blob). */
  webFile?: Blob;
  isImage: boolean;
}

type Source = "camera" | "gallery" | "document" | "text";

const PROGRESS_STEPS = [
  "Uploading…",
  "Reading the document…",
  "Extracting item lines…",
  "Normalising prices and units…",
  "Matching items to the catalogue…",
  "Almost done…",
];

function formatBytes(n?: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function guessImageName(fileName?: string | null, mime?: string): string {
  if (fileName) return fileName;
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return `photo-${Date.now()}.${ext}`;
}

function OptionTile({
  icon,
  label,
  hint,
  onPress,
  active,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.tile,
        active && styles.tileActive,
        disabled && { opacity: 0.45 },
        pressed && !disabled && { opacity: 0.85 },
      ]}
    >
      <View style={[styles.tileIcon, active && { backgroundColor: colors.primary }]}>
        <Ionicons name={icon} size={20} color={active ? "#fff" : colors.primary} />
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileHint} numberOfLines={2}>
        {hint}
      </Text>
    </Pressable>
  );
}

function ProgressView({ label }: { label: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, PROGRESS_STEPS.length - 1)), 7000);
    return () => clearInterval(timer);
  }, []);
  return (
    <View style={styles.progress}>
      <View style={styles.progressIcon}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
      <Text style={styles.progressTitle}>{label}</Text>
      <Text style={styles.progressStep}>{PROGRESS_STEPS[step]}</Text>
      <Text style={styles.progressHint}>This usually takes 10–60 seconds. Keep the app open.</Text>
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${Math.round(((step + 1) / (PROGRESS_STEPS.length + 1)) * 100)}%` }]} />
      </View>
    </View>
  );
}

function NewImportContent() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const role = user?.role ?? "BUYER";
  const isSupplier = role === "SUPPLIER";
  const isBuyer = role === "BUYER";
  const isAdmin = role === "ADMIN";

  const { data: aiConfig } = useApi(() => api.aiConfig(), []);
  const aiEnabled = aiConfig ? aiConfig.enabled : true; // optimistic until loaded
  const maxFileMb = aiConfig?.maxFileMb ?? 15;

  const [source, setSource] = useState<Source | null>(null);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [text, setText] = useState("");
  const [city, setCity] = useState<string>(user?.company?.city ?? "");
  const [supplierName, setSupplierName] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [quotationDate, setQuotationDate] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const title = isSupplier ? t("scanPriceList") : isBuyer ? "Upload a quotation you received" : "Import prices";
  const headerTitle = isSupplier ? "Scan your price list" : isBuyer ? "Upload a quotation" : "Import prices";
  const subtitle = isSupplier
    ? "Photograph or upload your current price list. We read every line, match it to the catalogue and let you review before anything goes live."
    : isBuyer
      ? "Upload a quotation a supplier sent you. Every price is added to the market view so you can compare it with other suppliers."
      : "Upload a supplier price list or paste prices. Rows are matched to the catalogue and published as market prices after review.";

  const kind: ImportKind = useMemo(() => {
    if (isSupplier) return "SUPPLIER_PRICE_LIST";
    if (isBuyer) return "BUYER_QUOTATION";
    return source === "text" ? "TEXT" : "SUPPLIER_PRICE_LIST";
  }, [isSupplier, isBuyer, source]);

  const setPicked = (picked: PickedFile, from: Source) => {
    setFile(picked);
    setSource(from);
    setText("");
    setFormError(null);
  };

  const pickFromCamera = async () => {
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setFormError("Camera access was denied. Allow the camera in Settings or choose a file instead.");
          return;
        }
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
        exif: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const type = a.mimeType ?? "image/jpeg";
      setPicked({ uri: a.uri, name: guessImageName(a.fileName, type), type, size: a.fileSize, isImage: true }, "camera");
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  };

  const pickFromGallery = async () => {
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setFormError("Photo library access was denied. Allow photos in Settings or choose a file instead.");
          return;
        }
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
        allowsMultipleSelection: false,
        exif: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const type = a.mimeType ?? "image/jpeg";
      setPicked({ uri: a.uri, name: guessImageName(a.fileName, type), type, size: a.fileSize, isImage: true }, "gallery");
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  };

  const pickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: aiEnabled ? [PDF_TYPE, ...SPREADSHEET_TYPES] : SPREADSHEET_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const lower = a.name.toLowerCase();
      const type =
        a.mimeType ??
        (lower.endsWith(".pdf")
          ? PDF_TYPE
          : lower.endsWith(".csv")
            ? "text/csv"
            : lower.endsWith(".xls")
              ? "application/vnd.ms-excel"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      setPicked({ uri: a.uri, name: a.name, type, size: a.size, webFile: a.file, isImage: false }, "document");
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  };

  const chooseText = () => {
    setSource("text");
    setFile(null);
    setFormError(null);
  };

  const needsAi = file ? file.isImage || file.type === PDF_TYPE : false;

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (source === "text") {
      if (text.trim().length < 3) next.text = "Paste at least one line with an item and a price";
    } else if (!file) {
      setFormError("Take a photo, choose a file or paste text first.");
      return false;
    }
    if (file?.size && file.size > maxFileMb * 1024 * 1024) next.file = `File is larger than ${maxFileMb} MB`;
    if (file && needsAi && !aiEnabled) next.file = "AI reading is off on this server: photos and PDFs cannot be read. Use CSV/Excel or paste text.";
    if (isBuyer && !supplierName.trim()) next.supplierName = "Who sent this quotation?";
    if (quotationDate && !isValidYmd(quotationDate)) next.quotationDate = "Use the format YYYY-MM-DD";
    setErrors(next);
    if (next.file) setFormError(next.file);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    setFormError(null);
    if (!validate()) return;
    const form = new FormData();
    form.append("kind", kind);
    if (city) form.append("city", city);
    if (isBuyer) {
      form.append("supplierName", supplierName.trim());
      form.append("sourceName", `Quotation – ${supplierName.trim()}`);
      if (quotationDate) form.append("quotationDate", quotationDate);
    } else if (sourceName.trim()) {
      form.append("sourceName", sourceName.trim());
    } else if (user?.company?.name) {
      form.append("sourceName", user.company.name);
    }

    if (source === "text") {
      form.append("text", text.trim());
    } else if (file) {
      if (Platform.OS === "web") {
        try {
          const blob = file.webFile ?? (await (await fetch(file.uri)).blob());
          form.append("file", blob, file.name);
        } catch (err) {
          setFormError(`Could not read the selected file (${getErrorMessage(err)})`);
          return;
        }
      } else {
        // React Native's FormData accepts { uri, name, type } as a file part.
        form.append("file", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
      }
    }

    setSubmitting(true);
    try {
      const created = await api.createImport(form);
      router.replace(`/imports/${created.id}`);
    } catch (err) {
      setFormError(getErrorMessage(err));
      setSubmitting(false);
    }
  };

  if (submitting) {
    return (
      <Screen>
        <Stack.Screen options={{ title: headerTitle, headerBackVisible: false, gestureEnabled: false }} />
        <ProgressView label={isBuyer ? "Reading your quotation" : "Reading your price list"} />
      </Screen>
    );
  }

  return (
    <Screen scroll keyboard>
      <Stack.Screen options={{ title: headerTitle }} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {aiConfig && !aiConfig.enabled ? (
        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
          <Text style={styles.noticeText}>
            AI reading is turned off on this server. Photos and PDFs cannot be read right now, but pasted text and
            CSV/Excel files still work.
          </Text>
        </View>
      ) : null}

      <View style={styles.grid}>
        <OptionTile
          icon="camera-outline"
          label="Take a photo"
          hint="Snap the printed list"
          onPress={pickFromCamera}
          active={source === "camera"}
          disabled={!aiEnabled}
        />
        <OptionTile
          icon="images-outline"
          label="Choose from gallery"
          hint="A photo or screenshot"
          onPress={pickFromGallery}
          active={source === "gallery"}
          disabled={!aiEnabled}
        />
        <OptionTile
          icon="document-attach-outline"
          label="Pick a PDF/Excel"
          hint={aiEnabled ? "PDF, XLSX, XLS or CSV" : "XLSX, XLS or CSV"}
          onPress={pickDocument}
          active={source === "document"}
        />
        <OptionTile
          icon="create-outline"
          label="Paste text"
          hint="Copied from WhatsApp or email"
          onPress={chooseText}
          active={source === "text"}
        />
      </View>

      {file ? (
        <Card style={styles.fileCard}>
          {file.isImage ? (
            <Image source={{ uri: file.uri }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={styles.fileIcon}>
              <Ionicons name={file.type === PDF_TYPE ? "document-text-outline" : "grid-outline"} size={22} color={colors.primary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={typography.body} numberOfLines={2}>
              {file.name}
            </Text>
            <Text style={typography.caption}>
              {file.type}
              {file.size ? ` · ${formatBytes(file.size)}` : ""}
              {needsAi ? " · read with AI" : ""}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setFile(null);
              setSource(null);
            }}
            hitSlop={10}
            accessibilityLabel="Remove file"
          >
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </Pressable>
        </Card>
      ) : null}

      {source === "text" ? (
        <TextField
          label="Prices as text"
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (errors.text) setErrors((e) => ({ ...e, text: "" }));
          }}
          multiline
          numberOfLines={8}
          style={{ minHeight: 160 }}
          placeholder={"One item per line, e.g.\nPortland cement 50kg bag – 18.5 SAR\nRebar 12mm – 2,850 SAR/ton\nHollow block 20cm – 2.9 SAR/piece"}
          error={errors.text || null}
          hint="Item name, unit and price per line. Arabic and English both work."
        />
      ) : null}

      <View style={styles.fields}>
        {isBuyer ? (
          <TextField
            label="Supplier who sent the quotation"
            value={supplierName}
            onChangeText={(v) => {
              setSupplierName(v);
              if (errors.supplierName) setErrors((e) => ({ ...e, supplierName: "" }));
            }}
            placeholder="e.g. Al Rajhi Building Materials"
            autoCapitalize="words"
            error={errors.supplierName || null}
          />
        ) : null}
        {isAdmin ? (
          <TextField
            label="Source name (optional)"
            value={sourceName}
            onChangeText={setSourceName}
            placeholder="e.g. Supplier name or catalogue"
            autoCapitalize="words"
          />
        ) : null}
        <PickerField
          label={isBuyer ? "Delivery city (optional)" : "City these prices apply to"}
          value={city}
          placeholder="Select city"
          onPress={() => setCityOpen(true)}
        />
        {isBuyer ? (
          <TextField
            label="Quotation date (optional)"
            value={quotationDate}
            onChangeText={(v) => {
              setQuotationDate(v.replace(/[^0-9-]/g, "").slice(0, 10));
              if (errors.quotationDate) setErrors((e) => ({ ...e, quotationDate: "" }));
            }}
            placeholder="YYYY-MM-DD"
            keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
            autoCapitalize="none"
            error={errors.quotationDate || null}
          />
        ) : null}
      </View>

      {formError ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <Text style={styles.errorText}>{formError}</Text>
        </View>
      ) : null}

      <Button
        title={t("readPrices")}
        icon="sparkles-outline"
        size="lg"
        fullWidth
        onPress={submit}
        disabled={!source || (source !== "text" && !file)}
        style={{ marginTop: spacing.md }}
      />
      <Text style={styles.footnote}>
        Nothing is published automatically: you review every matched line before it goes live.
        {aiConfig?.maxFileMb ? ` Files up to ${aiConfig.maxFileMb} MB.` : ""}
      </Text>

      <PickerModal
        visible={cityOpen}
        title="City"
        options={CITY_OPTIONS}
        value={city}
        onSelect={setCity}
        onClose={() => setCityOpen(false)}
        searchable
        allowClear
        clearLabel="Not specified"
      />
    </Screen>
  );
}

export default function NewImportScreen() {
  return (
    <RequireAuth message="Log in to read prices from a document.">
      <NewImportContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.h1, fontSize: 22, marginTop: spacing.md },
  subtitle: { ...typography.bodySmall, marginTop: spacing.xs, marginBottom: spacing.lg, lineHeight: 19 },
  notice: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  noticeText: { ...typography.bodySmall, color: "#92400E", flex: 1, lineHeight: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
  tile: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadow.card,
  },
  tileActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  tileIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  tileLabel: { ...typography.body, fontWeight: "600" },
  tileHint: { ...typography.caption, marginTop: 2 },
  fileCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.neutralLight },
  fileIcon: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  fields: { marginTop: spacing.xs },
  errorBox: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    backgroundColor: colors.dangerLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  errorText: { ...typography.bodySmall, color: colors.danger, flex: 1 },
  footnote: { ...typography.caption, textAlign: "center", marginTop: spacing.md, lineHeight: 17 },
  progress: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  progressIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  progressTitle: { ...typography.h2, textAlign: "center" },
  progressStep: { ...typography.body, color: colors.primary, fontWeight: "600", marginTop: spacing.sm, textAlign: "center" },
  progressHint: { ...typography.bodySmall, marginTop: spacing.xs, textAlign: "center" },
  progressBarTrack: { width: "80%", height: 6, borderRadius: 3, backgroundColor: colors.neutralLight, marginTop: spacing.xl, overflow: "hidden" },
  progressBarFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
});
