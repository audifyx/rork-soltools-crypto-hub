# Prompt for OGScan Website Agent: Fix Direct Tool Routes on Vercel

The OGScan mobile app embeds individual OGScan tool pages by direct URL. Right now, some pages only work when clicked from the main site, but direct links like `/scanner` or `/snipe-feed` can return `Not Found`.

Please fix the OGScan web app so every tool page works as a direct browser URL on Vercel.

## Current production domain

```txt
https://www.ogscan.fun
```

Use this exact domain format with `www` in all production links unless the deployment redirects differently.

## Goal

Every OGScan tool must be available as its own standalone route/page, not only through client-side navigation from the homepage.

Direct links must work when:

- opened in a new browser tab
- refreshed directly
- embedded inside a mobile WebView
- shared as a URL
- accessed through `/page/6` or `/page-6` style numbered routes

## Required direct routes

Please make sure these routes render correctly on Vercel:

```txt
/
/app
/command
/home
/our-coin
/roadmap
/market-pulse
/snipe-feed
/dev-wallet-radar
/dev-wallet
/scanner
/og-finder
/og-scanner
/ogscan-scanner
/pairs
/migrations
/migration-tool
/migration-tracker
/trending
/whales
/tx-feed
/tape
/transactions
/transaction-feed
/swap
/tech
```

## Required numbered routes

These should also work:

```txt
/page/1
/page/2
/page/3
/page/4
/page/5
/page/6
/page/7
/page/8
/page/9
/page/10
/page/11
/page/12
/page/13
/page/14

/page-1
/page-2
/page-3
/page-4
/page-5
/page-6
/page-7
/page-8
/page-9
/page-10
/page-11
/page-12
/page-13
/page-14
```

## Route map

| Page | Main route | Aliases | Purpose |
|---:|---|---|---|
| Home | `/` | none | Public beta landing page |
| 1 | `/app` | `/page/1`, `/page-1`, `/command`, `/home` | Command dashboard |
| 2 | `/our-coin` | `/page/2`, `/page-2` | Official OGScan coin page |
| 3 | `/roadmap` | `/page/3`, `/page-3` | Roadmap and vision |
| 4 | `/market-pulse` | `/page/4`, `/page-4`, `/market` | Market pulse |
| 5 | `/snipe-feed` | `/page/5`, `/page-5`, `/dev-wallet-radar`, `/dev-wallet` | Snipe feed / dev wallet radar |
| 6 | `/scanner` | `/page/6`, `/page-6`, `/og-scanner`, `/ogscan-scanner` | Token scanner |
| 7 | `/og-finder` | `/page/7`, `/page-7` | OG token finder |
| 8 | `/pairs` | `/page/8`, `/page-8` | New pairs radar |
| 9 | `/migrations` | `/page/9`, `/page-9`, `/migration-tool`, `/migration-tracker` | Migration tracker |
| 10 | `/trending` | `/page/10`, `/page-10` | Trending Solana tokens |
| 11 | `/whales` | `/page/11`, `/page-11` | Whale concentration |
| 12 | `/tx-feed` | `/page/12`, `/page-12`, `/tape`, `/transactions`, `/transaction-feed` | Transaction feed |
| 13 | `/swap` | `/page/13`, `/page-13` | Jupiter swap quote page |
| 14 | `/tech` | `/page/14`, `/page-14` | Data/API stack explanation |

## If this is a single-page app

If OGScan is built as a React/Vite SPA, add a Vercel rewrite so all routes serve the app shell:

Create or update `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/"
    }
  ]
}
```

Then make sure the React router defines the routes above and renders the correct standalone tool page based on the path.

## If this is Next.js App Router

Create real route files for each path, or use dynamic catch-all routing that maps the aliases above to the correct page.

For example:

```txt
app/scanner/page.tsx
app/snipe-feed/page.tsx
app/migrations/page.tsx
app/page/[id]/page.tsx
```

Also support `/page-6` style routes through explicit pages, middleware, or a dynamic mapping.

## If this is Next.js Pages Router

Create real pages or dynamic route handlers such as:

```txt
pages/scanner.tsx
pages/snipe-feed.tsx
pages/migrations.tsx
pages/page/[id].tsx
```

For `/page-6` style routes, use explicit pages, middleware, rewrites, or a route parser.

## Important behavior

Each route should open only that page/tool and show a clear page title at the top.

Do not rebuild the old giant long scrolling page. The site should behave as a true multi-page OGScan tool system.

## Mobile app embed links that must work

The mobile app will embed these exact links:

```txt
https://www.ogscan.fun/
https://www.ogscan.fun/app
https://www.ogscan.fun/our-coin
https://www.ogscan.fun/roadmap
https://www.ogscan.fun/market-pulse
https://www.ogscan.fun/snipe-feed
https://www.ogscan.fun/scanner
https://www.ogscan.fun/og-finder
https://www.ogscan.fun/pairs
https://www.ogscan.fun/migrations
https://www.ogscan.fun/trending
https://www.ogscan.fun/whales
https://www.ogscan.fun/tx-feed
https://www.ogscan.fun/swap
https://www.ogscan.fun/tech
```

Please deploy after the fix and test by directly opening these URLs in a fresh browser tab, not only by clicking around from the homepage.
