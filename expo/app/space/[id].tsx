import { Stack, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";

import SpacesWebShell from "@/components/space/SpacesWebShell";

export default function SpaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const safeId = typeof id === "string" ? id : "";
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <SpacesWebShell title="Space" subtitle={safeId ? `Room ${safeId.slice(0, 8)}` : undefined} path={safeId ? `/space/${safeId}` : "/spaces"} />
    </>
  );
}
