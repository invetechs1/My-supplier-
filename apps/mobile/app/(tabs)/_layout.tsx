import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { colors } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(focused: IconName, unfocused: IconName) {
  return ({ color, size, focused: isFocused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={isFocused ? focused : unfocused} size={size} color={color} />
  );
}

export const unstable_settings = {
  initialRouteName: "shop",
};

export default function TabsLayout() {
  const { t } = useI18n();
  const { isSupplier } = useAuth();
  const { count } = useCart();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="shop"
        options={{
          title: t("shop"),
          tabBarIcon: tabIcon("storefront", "storefront-outline"),
          tabBarBadge: count > 0 ? (count > 99 ? "99+" : count) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.text, fontSize: 10, fontWeight: "700" },
        }}
      />
      <Tabs.Screen name="index" options={{ title: t("home"), tabBarIcon: tabIcon("home", "home-outline") }} />
      <Tabs.Screen name="search" options={{ title: t("search"), tabBarIcon: tabIcon("search", "search-outline") }} />
      <Tabs.Screen
        name="rfqs"
        options={{
          title: isSupplier ? t("marketplace") : t("rfqs"),
          tabBarIcon: tabIcon("document-text", "document-text-outline"),
        }}
      />
      <Tabs.Screen name="orders" options={{ title: t("orders"), tabBarIcon: tabIcon("cube", "cube-outline") }} />
      <Tabs.Screen name="profile" options={{ title: t("profile"), tabBarIcon: tabIcon("person", "person-outline") }} />
    </Tabs>
  );
}
