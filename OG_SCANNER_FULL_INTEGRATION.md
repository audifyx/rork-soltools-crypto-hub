# OG Scanner Full Tools System Integration

This file is a concrete integration spec for cloning the full tools system from `audifyx/rork-og-meme-coin-tracker` into `audifyx/rork-soltools-crypto-hub`.

## Source
`audifyx/rork-og-meme-coin-tracker`

Latest inspected source commit:
`9a7713140fc27be16170f22c381b8da3241a8e7e`

Confirmed OG Scanner source includes live-token/tool logic from files/components such as:
- `SnipeFeed`
- `OurCoin`
- `SiteHeader`
- `SiteFooter`
- `BetaHome`
- `Index`
- `@/lib/og`

The latest inspected OG Scanner commit updated live OGScan token details, official links, default watched dev wallet, default watched mint, Dexscreener/Pump.fun links, and scanner defaults.

## Required integration behavior

Clone the entire OG Scanner tools system into SolTools as native app tools. Do not simply link out to the OG Scanner site.

The integrated SolTools app must include:

### OG Scanner main tool
- Main OG Scanner entry inside SolTools
- Native mobile screen or tab
- Dark SolTools theme compatibility
- Clean mobile cards for token rows
- No desktop tables crushed on mobile

### Token discovery tools
- Snipe feed
- Fresh Solana launches
- New pair detection
- Trending tokens
- Recently migrated tokens
- Token age
- Liquidity
- Market cap
- Volume
- Buy/sell activity
- Chart links
- Social/official links when available
- Risk and danger signals
- Dev score

### Wallet/dev intelligence
- Dev wallet intel
- Creator wallet profile
- Previous launches
- Win/rug history if available
- Average liquidity
- Latest coins
- Watched dev wallet storage
- Default OGScan dev wallet pinned into watch list

### Token analysis
- Launch analyzer
- Holder risk
- Liquidity quality
- Social link checks
- Chart view/open button
- Warnings
- Token scoring
- Momentum scoring
- Buy/sell pressure
- Holder concentration

### Live/realtime systems
- Live feed refresh behavior
- API polling or websocket behavior from source
- Reconnect handling
- Cached loading states
- No infinite loading
- No duplicate events
- No freezing during rapid updates

### Official OGScan coin support
The OG Scanner source uses:
- Official OGScan token mint: `EfnZmcFKMXofKA5V5ujvjqtSorvuQD2MzJPz3dxXpump`
- OGScan dev wallet: `CicbPxARTDrwQ4XcxWsn6SYeG4FMJHirS633cZUJeQDh`

Integrate these into SolTools as verified defaults:
- Default watched mint
- Default watched dev wallet
- Official token detail card
- Copy CA button
- Copy dev wallet button
- Dexscreener link
- Pump.fun link

### API connections to preserve
Preserve the same OG Scanner external connections from `@/lib/og` and related source files, including any source usage of:
- Jupiter Lite API
- Birdeye public API
- Helius API/RPC
- Dexscreener links
- Pump.fun links
- Any token-list APIs
- Any live transaction APIs

Server/security rule:
- Do not expose private API keys in frontend bundles.
- Public endpoints can remain public.
- Any private Helius/Birdeye keys must move to secure env/server-side handling if required.

## SolTools target implementation plan

### 1. Add native tool route
Create a SolTools-native OG Scanner route/screen, for example:
- `app/(tabs)/scanner.tsx`
- or `app/tools/og-scanner.tsx`

It should render the scanner dashboard and subtools.

### 2. Add shared scanner library
Create a scanner module inside SolTools:
- `lib/og-scanner/constants.ts`
- `lib/og-scanner/api.ts`
- `lib/og-scanner/format.ts`
- `lib/og-scanner/storage.ts`
- `lib/og-scanner/types.ts`

Move source scanner constants, API calls, formatting helpers, storage keys, and types into this module.

### 3. Add scanner components
Create SolTools-native components:
- `components/og-scanner/ScannerHome.tsx`
- `components/og-scanner/SnipeFeed.tsx`
- `components/og-scanner/TokenCard.tsx`
- `components/og-scanner/TokenDetail.tsx`
- `components/og-scanner/DevWalletIntel.tsx`
- `components/og-scanner/LaunchAnalyzer.tsx`
- `components/og-scanner/OfficialOGScanCoin.tsx`
- `components/og-scanner/ScannerAlerts.tsx`

Convert web-only logic from OG Tracker to React Native/Expo equivalents:
- Replace `localStorage` with AsyncStorage or existing app storage helper.
- Replace `navigator.clipboard` with Expo Clipboard or existing clipboard helper.
- Replace `<a href>` with `Linking.openURL`.
- Replace DOM/web-only layout with React Native components.
- Replace web CSS/Tailwind classes with StyleSheet/NativeWind depending on SolTools stack.

### 4. Add navigation entry
Add OG Scanner to SolTools navigation:
- Main tools tab
- Home quick action
- Search/discovery screen
- Profile/tools menu if applicable

### 5. Preserve existing SolTools features
Do not break:
- Auth
- Profiles
- Communities
- Feed
- Notifications
- Legal pages
- Reset password
- Existing token/listing tools

## Required QA before merge complete

- SolTools app builds successfully.
- Scanner screen opens inside SolTools.
- Snipe feed returns live data.
- Trending/new pair tools return live data.
- Official OGScan coin card shows correct CA.
- Copy CA works.
- Copy dev wallet works.
- Dexscreener link opens.
- Pump.fun link opens.
- Watched dev/mint defaults include OGScan wallet/mint.
- API failures show friendly errors.
- No white screens.
- No infinite loaders.
- No dead APIs.
- No secret keys exposed.
- Existing SolTools app still works.

## Status
This spec was added after confirming GitHub access to both repos. The connector exposed commits and diffs but not a reliable full repository file tree through code search. Because of that, direct blind code movement should not be done without fetching the exact source files first. Use this file as the required implementation contract for the next coding pass or Rork agent.