import { useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";

import OGScanEmbedScreen from "@/components/OGScanEmbedScreen";
import { getOGScanScreen } from "@/lib/ogscanRoutes";

export default function OGScanToolRoute() {
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const screen = useMemo(() => getOGScanScreen(slug), [slug]);

  return <OGScanEmbedScreen title={screen.title} path={screen.path} subtitle={screen.subtitle} />;
}
