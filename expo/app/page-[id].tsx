import { useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";

import OGScanEmbedScreen from "@/components/OGScanEmbedScreen";
import { getOGScanScreen, OGSCAN_PAGE_MAP } from "@/lib/ogscanRoutes";

export default function OGScanDashedNumberedPageRoute() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const screen = useMemo(() => getOGScanScreen(OGSCAN_PAGE_MAP[id ?? "1"]), [id]);

  return <OGScanEmbedScreen title={screen.title} path={screen.path} subtitle={screen.subtitle} />;
}
