import React from "react";
import { Link, Stack } from "expo-router";
import { Screen, EmptyState } from "@/components";
import { useRouter } from "expo-router";

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <Screen>
      <Stack.Screen options={{ title: "Not found" }} />
      <EmptyState icon="compass-outline" title="This screen does not exist" actionTitle="Go home" onAction={() => router.replace("/(tabs)")} />
      <Link href="/(tabs)" style={{ display: "none" }}>
        home
      </Link>
    </Screen>
  );
}
