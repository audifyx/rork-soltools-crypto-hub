import React from "react";

import LegalDoc from "@/components/LegalDoc";

export default function PrivacyScreen() {
  return (
    <LegalDoc
      eyebrow="LEGAL"
      title="Privacy Policy"
      effectiveDate="May 9, 2026"
      intro="SolTools provides a Solana trading and social suite. This policy explains what data is collected, why it is collected, and the controls you have." 
      sections={[
        {
          heading: "Information we collect",
          body: "Account info you provide (email, username, avatar, bio), public on-chain data tied to wallets you connect, content you publish (posts, comments, chat messages, reels), device and diagnostic logs needed to keep the app stable, and basic usage analytics.",
        },
        {
          heading: "Wallet and on-chain data",
          body: "When you link a Solana wallet we read public balances, holdings, and transactions for the SolTools holder verification flow. We never request your private keys or seed phrase \u2014 SolTools cannot access them and will never ask.",
        },
        {
          heading: "How we use your data",
          body: "To run your account, render your profile and badges, verify token-holder access to gated communities, deliver realtime feeds and notifications, prevent abuse, and improve the product. We do not sell your personal data.",
        },
        {
          heading: "Sharing",
          body: "We share data with Supabase (auth, database, realtime, storage), Solana RPC providers, and infrastructure vendors strictly to operate the app. Public profile content (username, avatar, posts) is visible to other users by design.",
        },
        {
          heading: "Retention",
          body: "We keep account data while your account is active. You can request deletion at any time from Profile \u2192 Settings \u2192 Privacy, or by emailing support. Backups are purged on a rolling 30-day cycle.",
        },
        {
          heading: "Your rights",
          body: "Depending on your jurisdiction you may request access, correction, export, or deletion of your data, and you may withdraw consent for optional processing such as analytics. Contact us to exercise these rights.",
        },
        {
          heading: "Security",
          body: "We use TLS in transit, row-level security on Supabase, signed URLs for media, and least-privilege service keys. No system is perfectly secure \u2014 use a strong, unique password and keep your wallet seed offline.",
        },
        {
          heading: "Children",
          body: "SolTools is not directed to anyone under 13, and you must be of legal age in your jurisdiction to trade or interact with token-gated features.",
        },
        {
          heading: "Changes",
          body: "We may update this policy. Material changes will be highlighted in-app. Continued use after changes take effect means you accept the updated policy.",
        },
      ]}
      contact="Questions or data requests: privacy@soltools.app"
    />
  );
}
