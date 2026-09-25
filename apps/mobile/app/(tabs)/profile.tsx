import React, { useCallback, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { Screen, Button, Card, SectionHeader, KeyValue, StatusBadge } from "@/components";
import { api, WEB_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n, type Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { colors, radius, spacing, typography, shadow } from "@/theme";

function Row({
  icon,
  label,
  value,
  onPress,
  badge,
  danger = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  badge?: number;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.neutralLight }]}>
      <View style={[styles.rowIcon, danger && { backgroundColor: colors.dangerLight }]}>
        <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.primary} />
      </View>
      <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
        </View>
      ) : null}
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isSupplier, canManageCompany, logout, setUser } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) {
        setUnread(0);
        return;
      }
      let cancelled = false;
      api
        .notifications(true)
        .then((res) => {
          if (!cancelled) setUnread(res.unread || res.data.filter((n) => !n.read).length);
        })
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, [isAuthenticated]),
  );

  const changeLocale = (next: Locale) => {
    setLocale(next);
    if (user) {
      api
        .updateMe({ locale: next })
        .then(setUser)
        .catch(() => undefined);
    }
  };

  const confirmLogout = () => {
    if (Platform.OS === "web") {
      void logout();
      return;
    }
    Alert.alert(t("logout"), "You can keep browsing prices without an account.", [
      { text: "Cancel", style: "cancel" },
      { text: t("logout"), style: "destructive", onPress: () => logout() },
    ]);
  };

  const openWeb = (path: string) => {
    WebBrowser.openBrowserAsync(`${WEB_URL}${path}`).catch(() => undefined);
  };

  const initials = (user?.name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Screen scroll>
      <Text style={styles.heading}>{t("profile")}</Text>

      {isAuthenticated && user ? (
        <Card style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={typography.h3}>{user.name}</Text>
            <Text style={typography.bodySmall}>{user.email}</Text>
            <View style={{ marginTop: 6 }}>
              <StatusBadge status={user.role} small />
            </View>
          </View>
        </Card>
      ) : (
        <Card>
          <Text style={typography.h3}>You are browsing as a guest</Text>
          <Text style={[typography.bodySmall, { marginTop: 4, marginBottom: spacing.md }]}>
            Log in to request quotes, bid on RFQs and track orders.
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button title={t("login")} onPress={() => router.push("/(auth)/login")} style={{ flex: 1 }} />
            <Button title={t("register")} variant="outline" onPress={() => router.push("/(auth)/register")} style={{ flex: 1 }} />
          </View>
        </Card>
      )}

      {user?.company ? (
        <>
          <SectionHeader title="Company" actionTitle={isSupplier ? t("companyProfile") : undefined} onAction={isSupplier ? () => router.push("/supplier/company") : undefined} />
          <Card>
            <View style={styles.companyHead}>
              <Text style={typography.h3}>{user.company.name}</Text>
              {user.company.verified ? (
                <View style={styles.verified}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              ) : (
                <Text style={typography.caption}>Pending verification</Text>
              )}
            </View>
            <KeyValue label="Type" value={user.company.type} />
            <KeyValue label="City" value={user.company.city} />
            {user.company.crNumber ? <KeyValue label="CR number" value={user.company.crNumber} /> : null}
            {user.company.phone ? <KeyValue label="Phone" value={user.company.phone} /> : null}
            <KeyValue label="Rating" value={user.company.ratingCount ? `${user.company.rating.toFixed(1)} / 5 (${user.company.ratingCount})` : "No ratings yet"} />
            <KeyValue label="Member since" value={formatDate(user.company.createdAt)} />
          </Card>
        </>
      ) : null}

      <SectionHeader title="Settings" />
      <View style={styles.group}>
        <View style={styles.row}>
          <View style={styles.rowIcon}>
            <Ionicons name="language-outline" size={18} color={colors.primary} />
          </View>
          <Text style={styles.rowLabel}>{t("language")}</Text>
          <View style={styles.segment}>
            {(["en", "ar"] as Locale[]).map((l) => (
              <Pressable key={l} onPress={() => changeLocale(l)} style={[styles.segmentBtn, locale === l && styles.segmentBtnActive]}>
                <Text style={[styles.segmentText, locale === l && styles.segmentTextActive]}>{l === "en" ? "EN" : "عربي"}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Row icon="list-outline" label={t("boqResearch")} onPress={() => router.push("/boq")} />
        {isAuthenticated ? (
          <Row icon="notifications-outline" label={t("notifications")} badge={unread} onPress={() => router.push("/notifications")} />
        ) : null}
        {isSupplier ? (
          <>
            <Row icon="speedometer-outline" label={t("dashboard")} onPress={() => router.push("/supplier/dashboard")} />
            <Row icon="cube-outline" label={t("inventory")} onPress={() => router.push("/supplier/inventory")} />
            {canManageCompany ? <Row icon="wallet-outline" label={t("finance")} onPress={() => router.push("/supplier/finance")} /> : null}
            {canManageCompany ? <Row icon="people-outline" label={t("team")} onPress={() => router.push("/supplier/team")} /> : null}
            <Row icon="business-outline" label={t("companyProfile")} onPress={() => router.push("/supplier/company")} />
            <Row icon="pricetags-outline" label={t("myPriceList")} onPress={() => router.push("/supplier/prices")} />
            <Row icon="scan-outline" label={t("scanPriceList")} onPress={() => router.push("/imports/new")} />
            <Row icon="cloud-upload-outline" label={t("myImports")} onPress={() => router.push("/imports")} />
          </>
        ) : null}
        {isAuthenticated && !isSupplier ? (
          <>
            <Row icon="repeat-outline" label={t("buyAgain")} onPress={() => router.push("/buy-again")} />
            <Row icon="heart-outline" label={t("myLists")} onPress={() => router.push("/lists")} />
            <Row icon="calendar-outline" label={t("recurringOrders")} onPress={() => router.push("/recurring")} />
            <Row icon="return-down-back-outline" label={t("returns")} onPress={() => router.push("/returns")} />
            <Row icon="notifications-circle-outline" label={t("priceAlerts")} onPress={() => router.push("/alerts")} />
            <Row icon="document-text-outline" label={t("newRfq")} onPress={() => router.push("/rfq/new")} />
            <Row icon="receipt-outline" label={user?.role === "ADMIN" ? "Import prices" : t("uploadQuotation")} onPress={() => router.push("/imports/new")} />
            <Row icon="albums-outline" label={user?.role === "ADMIN" ? t("myImports") : t("myQuotations")} onPress={() => router.push("/imports")} />
          </>
        ) : null}
      </View>

      {isAuthenticated ? (
        <>
          <SectionHeader title={t("account")} />
          <View style={styles.group}>
            <Row icon="person-circle-outline" label={t("accountSettings")} onPress={() => router.push("/account")} />
            <Row icon="location-outline" label={t("addresses")} onPress={() => router.push("/addresses")} />
            <Row icon="log-out-outline" label={t("logout")} onPress={confirmLogout} danger />
          </View>
        </>
      ) : null}

      <SectionHeader title="About" />
      <View style={styles.group}>
        <Row icon="document-outline" label={t("terms")} onPress={() => openWeb("/terms")} />
        <Row icon="shield-checkmark-outline" label={t("privacy")} onPress={() => openWeb("/privacy")} />
        <Row icon="help-circle-outline" label="Help & support" onPress={() => openWeb("/contact")} />
      </View>

      <Text style={styles.version}>MySupplier · v{Constants.expoConfig?.version ?? "1.0.0"}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { ...typography.h1, fontSize: 22, marginTop: spacing.md, marginBottom: spacing.lg },
  userCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  companyHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm, gap: spacing.sm },
  verified: { flexDirection: "row", alignItems: "center", gap: 4 },
  verifiedText: { ...typography.caption, color: colors.primary, fontWeight: "600" },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden", ...shadow.card },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  rowLabel: { ...typography.body, flex: 1, fontWeight: "500" },
  rowValue: { ...typography.bodySmall },
  badge: { backgroundColor: colors.danger, borderRadius: radius.pill, minWidth: 20, height: 20, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  segment: { flexDirection: "row", backgroundColor: colors.neutralLight, borderRadius: radius.pill, padding: 2 },
  segmentBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill },
  segmentBtnActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  segmentTextActive: { color: "#fff" },
  version: { ...typography.caption, textAlign: "center", marginTop: spacing.xxl },
});
