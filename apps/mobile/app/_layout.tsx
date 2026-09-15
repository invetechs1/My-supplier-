import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { AuthProvider } from "@/lib/auth";
import { useNotificationTapHandler } from "@/lib/push";
import { CartProvider } from "@/lib/cart";
import { I18nProvider } from "@/lib/i18n";
import { colors } from "@/theme";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

// On web, closes the popup opened by openAuthSessionAsync once the payment
// page redirects back to the app. No-op on native.
WebBrowser.maybeCompleteAuthSession();

/** Navigates when a push notification is tapped (data.link -> app route). */
function NotificationTapHandler() {
  useNotificationTapHandler();
  return null;
}

/**
 * Root layout. Unauthenticated users can browse everything under (tabs);
 * screens that need an account (RFQ creation, bidding, orders, price list)
 * use <RequireAuth> to send the user to the login screen and back.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider>
          <AuthProvider>
            <CartProvider>
              <StatusBar style="dark" />
              <NotificationTapHandler />
              <Stack
                screenOptions={{
                  headerTintColor: colors.primary,
                  headerTitleStyle: { color: colors.text, fontWeight: "600" },
                  headerStyle: { backgroundColor: colors.surface },
                  headerShadowVisible: false,
                  contentStyle: { backgroundColor: colors.background },
                  headerBackTitleVisible: false,
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)/login" options={{ title: "Log in", presentation: "modal" }} />
                <Stack.Screen name="(auth)/register" options={{ title: "Create account", presentation: "modal" }} />
                <Stack.Screen name="(auth)/forgot-password" options={{ title: "Reset password", presentation: "modal" }} />
                <Stack.Screen name="account" options={{ title: "Account" }} />
                <Stack.Screen name="payment" options={{ title: "Payment" }} />
                <Stack.Screen name="material/[id]" options={{ title: "Material" }} />
                <Stack.Screen name="boq" options={{ title: "BOQ price research" }} />
                <Stack.Screen name="rfq/new" options={{ title: "New RFQ" }} />
                <Stack.Screen name="rfq/[id]" options={{ title: "RFQ" }} />
                <Stack.Screen name="order/[id]" options={{ title: "Order" }} />
                <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
                <Stack.Screen name="supplier/prices" options={{ title: "My price list" }} />
                <Stack.Screen name="supplier/dashboard" options={{ title: "Business dashboard" }} />
                <Stack.Screen name="supplier/inventory" options={{ title: "Inventory" }} />
                <Stack.Screen name="supplier/inventory/[listingId]" options={{ title: "Stock" }} />
                <Stack.Screen name="supplier/finance" options={{ title: "Finance" }} />
                <Stack.Screen name="supplier/team" options={{ title: "Team" }} />
                <Stack.Screen name="supplier/company" options={{ title: "Company profile" }} />
                <Stack.Screen name="imports/index" options={{ title: "Imports" }} />
                <Stack.Screen name="imports/new" options={{ title: "Read prices" }} />
                <Stack.Screen name="imports/[id]" options={{ title: "Review import" }} />
                <Stack.Screen name="shop/search" options={{ title: "Shop" }} />
                <Stack.Screen name="shop/product/[id]" options={{ title: "Product" }} />
                <Stack.Screen name="cart" options={{ title: "Cart" }} />
                <Stack.Screen name="checkout" options={{ title: "Checkout" }} />
              </Stack>
            </CartProvider>
          </AuthProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
