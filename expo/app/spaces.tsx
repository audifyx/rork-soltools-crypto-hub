import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";

import SpacesWebShell from "@/components/space/SpacesWebShell";

export default function SpacesScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <SpacesWebShell title="Spaces" subtitle="Live audio rooms" path="/spaces" />
    </>
  );
}
