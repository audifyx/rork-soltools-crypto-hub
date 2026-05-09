import React from "react";

import LegalDoc from "@/components/LegalDoc";

export default function LicensesScreen() {
  return (
    <LegalDoc
      eyebrow="LEGAL"
      title="Open-source Licenses"
      effectiveDate="May 9, 2026"
      intro="SolTools is built on top of open-source software. We are grateful to the maintainers of these projects."
      sections={[
        {
          heading: "Core stack",
          body: "React Native, Expo, expo-router, React Query, Supabase JS, lucide-react-native, react-native-gesture-handler, react-native-reanimated, react-native-safe-area-context, react-native-screens.",
        },
        {
          heading: "Solana tooling",
          body: "@solana/web3.js, Jupiter aggregator APIs, public Solana RPC infrastructure.",
        },
        {
          heading: "Media and UI",
          body: "expo-linear-gradient, expo-image, expo-haptics, expo-blur, expo-av, react-native-svg.",
        },
        {
          heading: "Licenses",
          body: "Each dependency is licensed under its own terms (typically MIT, Apache-2.0, or BSD). Full license text is available in the source repositories of the respective packages.",
        },
      ]}
      contact="To request the full bundled license file email legal@soltools.app"
    />
  );
}
