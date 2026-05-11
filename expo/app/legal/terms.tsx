import React from "react";

import LegalDoc from "@/components/LegalDoc";

export default function TermsScreen() {
  return (
    <LegalDoc
      eyebrow="LEGAL"
      title="Terms of Service"
      effectiveDate="May 9, 2026"
      intro="These terms govern your use of SolTools. By creating an account or using the app you agree to them."
      sections={[
        {
          heading: "Eligibility",
          body: "You must be at least 13 years old and old enough in your jurisdiction to interact with crypto, tokens, and trading content. You are responsible for complying with local laws.",
        },
        {
          heading: "Your account",
          body: "Keep your credentials and wallet seed phrase safe. You are responsible for activity under your account. Do not impersonate others, scrape the app, or attempt to bypass holder gates or rate limits.",
        },
        {
          heading: "Not financial advice",
          body: "SolTools shows market data, KOL activity, launches, holder analytics, and community discussions. Nothing in the app is investment, legal, or tax advice. Trading tokens is risky and you can lose your entire balance.",
        },
        {
          heading: "User content",
          body: "You retain ownership of content you post. You grant SolTools a worldwide, royalty-free license to host, display, and distribute your content within the app. Do not post unlawful, abusive, infringing, or sexually explicit material.",
        },
        {
          heading: "Token-gated communities",
          body: "Access to holder-only and premium communities is granted by on-chain verification of supported tokens. Verification can lag chain state by a short interval, and access may be revoked automatically if your balance falls below the required tier.",
        },
        {
          heading: "Prohibited conduct",
          body: "No spam, phishing, market manipulation, doxxing, harassment, evasion of bans, malware, or attacks on the service. We may suspend or terminate accounts that violate these rules.",
        },
        {
          heading: "Third-party services",
          body: "SolTools surfaces data from Solana RPC providers, Jupiter, DEXs, and other third-party APIs. We do not control and are not responsible for third-party services, smart contracts, or tokens.",
        },
        {
          heading: "Disclaimers",
          body: "The app is provided \u201cas is\u201d without warranties of any kind. To the fullest extent permitted by law SolTools disclaims all implied warranties including merchantability, fitness, and non-infringement.",
        },
        {
          heading: "Limitation of liability",
          body: "To the fullest extent permitted by law, SolTools is not liable for indirect, incidental, special, or consequential damages, lost profits, lost tokens, or trading losses arising from your use of the app.",
        },
        {
          heading: "Termination",
          body: "You can close your account at any time. We can suspend or terminate access if you violate these terms or to protect users and the service.",
        },
        {
          heading: "Changes",
          body: "We may update these terms. Material changes will be highlighted in-app. Continued use after changes means you accept the updated terms.",
        },
      ]}
      contact="Questions: Telegram @ogscandev"
    />
  );
}
