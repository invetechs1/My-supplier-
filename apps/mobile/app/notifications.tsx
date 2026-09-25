import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import type { Notification, NotificationType } from "@mysupplier/shared";
import { Screen, EmptyState, ErrorView, LoadingView, RequireAuth, Button } from "@/components";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography } from "@/theme";

const ICONS: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  NEW_RFQ: "document-text-outline",
  NEW_BID: "pricetag-outline",
  BID_ACCEPTED: "checkmark-circle-outline",
  BID_REJECTED: "close-circle-outline",
  ORDER_UPDATE: "cube-outline",
  SYSTEM: "information-circle-outline",
  ANNOUNCEMENT: "megaphone-outline",
};

/** Map API `link` values (e.g. "/rfqs/abc", "/orders/xyz") to app routes. */
function resolveLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const rfq = link.match(/rfqs?\/([\w-]+)/);
  if (rfq) return `/rfq/${rfq[1]}`;
  const order = link.match(/orders?\/([\w-]+)/);
  if (order) return `/order/${order[1]}`;
  const material = link.match(/materials?\/([\w-]+)/);
  if (material) return `/material/${material[1]}`;
  return null;
}

function NotificationsContent() {
  const router = useRouter();
  const { data, loading, error, refreshing, reload, refresh, setData } = useApi(() => api.notifications(false), []);
  const [marking, setMarking] = useState(false);

  const markRead = async (n: Notification) => {
    if (!n.read) {
      setData((prev) =>
        prev ? { ...prev, unread: Math.max(0, prev.unread - 1), data: prev.data.map((x) => (x.id === n.id ? { ...x, read: true } : x)) } : prev,
      );
      api.markNotificationRead(n.id).catch(() => undefined);
    }
    const target = resolveLink(n.link);
    if (target) router.push(target as never);
  };

  const markAll = async () => {
    setMarking(true);
    try {
      await api.markAllNotificationsRead();
      setData((prev) => (prev ? { ...prev, unread: 0, data: prev.data.map((x) => ({ ...x, read: true })) } : prev));
    } finally {
      setMarking(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }
  if (error || !data) {
    return (
      <Screen>
        <ErrorView message={error ?? "Could not load notifications"} onRetry={reload} />
      </Screen>
    );
  }

  const unreadCount = data.data.filter((n) => !n.read).length;

  return (
    <Screen padded={false} edges={["bottom", "left", "right"]}>
      <Stack.Screen
        options={{
          headerRight: () =>
            unreadCount > 0 ? (
              <Button title="Mark all read" variant="ghost" size="sm" onPress={markAll} loading={marking} />
            ) : null,
        }}
      />
      <FlatList
        data={data.data}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={refresh}
        ListEmptyComponent={<EmptyState icon="notifications-off-outline" title="No notifications" message="Bids, awards and order updates will show up here." />}
        renderItem={({ item }) => (
          <Pressable onPress={() => markRead(item)} style={({ pressed }) => [styles.row, !item.read && styles.rowUnread, pressed && { opacity: 0.9 }]}>
            <View style={[styles.icon, !item.read && { backgroundColor: colors.primary }]}>
              <Ionicons name={ICONS[item.type] ?? "information-circle-outline"} size={18} color={item.read ? colors.primary : "#fff"} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, !item.read && { fontWeight: "700" }]}>{item.title}</Text>
              <Text style={typography.bodySmall} numberOfLines={3}>
                {item.body}
              </Text>
              <Text style={[typography.caption, { marginTop: 4 }]}>{timeAgo(item.createdAt)}</Text>
            </View>
            {resolveLink(item.link) ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
          </Pressable>
        )}
      />
    </Screen>
  );
}

export default function NotificationsScreen() {
  return (
    <RequireAuth>
      <NotificationsContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  row: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowUnread: { borderColor: colors.primaryLight, backgroundColor: "#F4FAF7" },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  title: { ...typography.body, fontWeight: "500", marginBottom: 2 },
});
