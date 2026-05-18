# OGSCAN / SOLTOOLS  
## Internal Technical Overview + Infrastructure Breakdown

---

# Overview

OGSCAN and SOLTOOLS are being built as a crypto-native infrastructure ecosystem focused entirely around the Solana blockchain.

The idea originally came from one major issue:

crypto users currently operate across completely fragmented systems.

Right now the average user needs:
- X for discussions
- Telegram for communities
- Discord for private groups
- DexScreener/Birdeye for charts
- wallet trackers for analytics
- separate bots for alerts
- separate scanners for launches
- separate tools for developer tracking

Nothing is unified.

Most current platforms were never designed specifically for crypto workflows, especially not high-speed Solana environments where:
- tokens launch every few seconds
- migrations happen constantly
- copy deployments appear instantly
- communities move between multiple platforms rapidly
- traders require real-time information

The goal behind OGSCAN and SOLTOOLS is to combine:
- token intelligence
- wallet analytics
- social systems
- discovery
- live communication
- creator infrastructure
- realtime data
- community ecosystems

inside a single connected platform.

The ecosystem is currently split into two major layers:

1. OGSCAN  
2. SOLTOOLS

OGSCAN acts as the analytics + intelligence infrastructure.

SOLTOOLS acts as the larger social + platform ecosystem.

---

# OGSCAN

Website:  
https://ogscan.fun

OGSCAN is focused heavily on token intelligence and wallet analytics across Solana.

The platform is specifically being optimized around meme ecosystems and fast-launch environments because traditional scanners currently fail badly in those conditions.

A large amount of existing tools only analyze:
- pair creation
- liquidity creation
- price movement
- volume
- basic holder stats

but this is not enough to determine:
- actual origin tokens
- migration legitimacy
- wallet coordination
- fake launches
- developer history
- ecosystem risk

The purpose of OGSCAN is to build a deeper intelligence layer on top of normal Solana token data.

---

# OG Detection System

The main feature currently being developed is the OG Detection Engine.

This system exists because of a major issue on Solana:

fake “OG” tokens.

A token launches and instantly:
- cloned names appear
- fake migrated versions appear
- duplicate contracts appear
- spoof liquidity appears
- fake community copies appear

Traditional scanners usually identify tokens through:
- first bonded pair
- highest market cap
- first indexed pair
- trending activity

but these methods are inaccurate in many cases.

An example issue:
a token migrates from one launch state to another and scanners incorrectly display:
- old dead contracts
- duplicate liquidity pairs
- temporary migration contracts
- non-canonical token origins

This causes confusion and creates opportunities for scams.

The OG Detection Engine is being designed to solve this problem.

---

# Detection Logic

The system currently focuses on:
- identifying the canonical token origin
- filtering duplicate pair structures
- identifying active migrated contracts
- eliminating dead migration contracts
- validating real liquidity activity
- comparing chronological deployment sequences
- detecting spoof launches
- identifying authentic live trading pairs

The engine is heavily optimized around Solana meme launch behavior.

Particular focus areas:
- Pump-style ecosystems
- migration-heavy launches
- duplicate token naming
- fake pair manipulation
- relaunch ecosystems

Instead of simply tracking:
“first pair created”

the engine attempts to identify:
“first authentic live token state”

which is significantly harder.

---

# Solana Optimization

The scanner is currently focused entirely on Solana because Solana launch behavior is fundamentally different from most chains.

Main reasons:
- extremely high launch velocity
- low deployment friction
- rapid liquidity creation
- migration-heavy token ecosystems
- meme duplication
- sniper bot activity
- very short trading windows

Most existing tooling struggles because they rely on generalized chain indexing instead of Solana-specific heuristics.

OGSCAN is being developed specifically around Solana-native behavior patterns.

---

# Wallet Intelligence Infrastructure

Another major component is wallet intelligence.

Most platforms currently provide:
- balances
- transaction history
- PnL

but deeper wallet behavior is rarely analyzed properly.

OGSCAN focuses more on behavioral analysis.

---

# Developer Tracking

The system tracks:
- previous launches
- wallet relationships
- connected deployment activity
- historical project outcomes
- rug behavior patterns
- launch frequency
- deployment clusters

The goal is to create contextual intelligence around developers rather than only displaying wallet balances.

---

# Bundled Supply Detection

One major risk on Solana launches is supply concentration.

The system analyzes:
- wallet clusters
- coordinated supply holding
- insider distributions
- suspicious allocation concentration
- early accumulation patterns

This helps identify tokens where ownership may be heavily centralized despite appearing distributed publicly.

---

# Sniper Wallet Detection

The system also attempts to identify sniper-style activity.

Patterns analyzed include:
- extremely early buys
- repetitive launch participation
- timing correlation
- coordinated wallet behavior
- launch-entry automation patterns

The purpose is not only tracking wallets individually but mapping ecosystem behavior patterns across launches.

---

# Wallet Relationship Mapping

A future major component is ecosystem graphing.

This includes:
- wallet relationship mapping
- transaction flow analysis
- deployment relationship graphs
- cluster behavior modeling
- ecosystem-level intelligence

The long-term goal is creating a much deeper intelligence layer than traditional token scanners currently provide.

---

# SOLTOOLS

GitHub:  
https://github.com/audifyx/rork-soltools-crypto-hub

The app combines:
- crypto social systems
- communities
- realtime messaging
- live communication
- token discovery
- analytics integration
- creator systems
- wallet identity

inside one environment.

The main philosophy behind SOLTOOLS is:

crypto users should not need 10 separate platforms to operate daily.

---

# Social Infrastructure

The app includes a crypto-native feed system.

Unlike traditional feeds focused on generic content, the system is being designed around:
- token discovery
- market movement
- community activity
- creator discussions
- realtime ecosystem events

Feeds are designed to integrate directly with analytics systems rather than existing separately from them.

---

# Community Infrastructure

Communities are a major part of the ecosystem.

Planned systems include:
- public communities
- holder-gated groups
- token-linked communities
- moderation systems
- creator spaces
- role systems
- badge infrastructure

Wallet-linked verification is also being integrated.

---

# Wallet-Linked Identity

One major focus is wallet identity integration.

Instead of profiles existing independently from blockchain activity, the platform aims to connect:
- wallet holdings
- holder verification
- badges
- ecosystem participation
- community access

directly into user identity systems.

---

# Audifyx Infrastructure

Audifyx is the live communication layer being integrated into SOLTOOLS.

This system powers:
- voice spaces
- live streams
- creator broadcasts
- project AMAs
- realtime discussions

Infrastructure is currently being built using:
- LiveKit
- realtime signaling systems
- custom room infrastructure
- participant state systems

The goal is creating native crypto communication infrastructure directly inside the ecosystem.

---

# Backend Infrastructure

Current stack includes:

Frontend:
- React Native
- Expo
- TypeScript

Backend:
- Supabase
- PostgreSQL
- Realtime subscriptions
- Edge Functions

Infrastructure:
- LiveKit
- Solana RPC integrations
- analytics engines
- wallet indexing systems

---

# Database Systems

The backend currently includes systems for:
- followers
- feed infrastructure
- DMs
- realtime messaging
- stories
- comments
- notifications
- communities
- moderation
- spaces
- referrals
- leaderboards
- wallet-linked identity
- rewards systems

The project is being built with direct backend wiring instead of relying heavily on placeholder mock systems.

A large amount of the infrastructure is already connected directly to SQL and realtime systems.

---

# Development Structure

Development is heavily iterative.

Main workflow includes:
- rapid frontend iteration
- direct SQL migrations
- realtime testing
- public commit tracking
- backend-first wiring
- continuous feature deployment

The ecosystem is also being developed publicly through:
- GitHub commits
- live development
- technical posts
- infrastructure updates
- public testing

---

# Long-Term Direction

The long-term goal is not simply another token scanner.

The larger direction is building:
a crypto-native operating ecosystem where:
- analytics
- social systems
- creator infrastructure
- communities
- communication
- discovery
- wallet intelligence

all exist together in a unified environment specifically optimized for crypto-native behavior.

---

# Official Links

🌐 Website  
https://ogscan.fun

𝕏 X  
https://x.com/ogscanbackup

💬 Telegram  
https://t.me/ogscanner

📢 Updates  
https://t.me/ogupdates

💻 GitHub  
https://github.com/audifyx/rork-soltools-crypto-hub
