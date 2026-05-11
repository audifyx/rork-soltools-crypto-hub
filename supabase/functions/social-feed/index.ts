// Edge function that fetches official OG SCAN social posts server-side.
//
// Why server-side?
//   - Mobile clients can't reliably hit Nitter/RSSHub mirrors (most are dead in 2026)
//     and t.me/s/<channel> often blocks non-browser user agents on mobile networks.
//   - From an edge function we can spoof a desktop browser UA, hit Twitter's
//     public *syndication* endpoint (the same one used by publish.twitter.com
//     embeds — no auth required), and parse Telegram's public web preview
//     reliably.
//   - Results are cached in-memory for 5 minutes per channel so we don't hammer
//     the upstreams when many users open the app.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

type SocialItem = {
  id: string;
  source: "telegram" | "x";
  source_label: string;
  url: string;
  text: string;
  image_url: string | null;
  published_at: string;
};

const memoryCache = new Map<string, { at: number; items: SocialItem[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
}

function stripHtml(input: string): string {
  return decodeEntities(input.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept-Language": "en-US,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTelegram(channel: string): Promise<SocialItem[]> {
  const url = `https://t.me/s/${channel}`;
  try {
    const res = await fetchWithTimeout(url, 8_000);
    if (!res.ok) {
      console.log("[social-feed] telegram non-ok", res.status);
      return [];
    }
    const html = await res.text();
    const blocks =
      html.match(/<div class="tgme_widget_message_wrap[\s\S]*?(?=<div class="tgme_widget_message_wrap|<\/section>)/g) ?? [];
    const items: SocialItem[] = [];
    for (const block of blocks) {
      const textMatch = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      const text = stripHtml(textMatch?.[1] ?? "");
      const linkMatch = block.match(/<a class="tgme_widget_message_date"[^>]*href="([^"]+)"/);
      const link = linkMatch?.[1] ?? `https://t.me/${channel}`;
      const timeMatch = block.match(/<time[^>]*datetime="([^"]+)"/);
      const published_at = timeMatch?.[1] ? new Date(timeMatch[1]).toISOString() : new Date().toISOString();
      const photoMatch = block.match(/tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/);
      const image_url = photoMatch?.[1] ?? null;
      if (!text && !image_url) continue;
      items.push({
        id: hashId(`telegram:${link}:${published_at}`),
        source: "telegram",
        source_label: "OG Updates (Telegram)",
        url: link,
        text: text || "(Photo)",
        image_url,
        published_at,
      });
    }
    return items.reverse();
  } catch (e) {
    console.log("[social-feed] telegram fail", e instanceof Error ? e.message : e);
    return [];
  }
}

type SyndicationTweet = {
  id_str?: string;
  full_text?: string;
  text?: string;
  created_at?: string;
  user?: { screen_name?: string };
  mediaDetails?: { media_url_https?: string }[];
  entities?: { media?: { media_url_https?: string }[] };
};

function parseSyndicationHtml(html: string): SyndicationTweet[] {
  // The new syndication HTML embeds tweets in a <script id="__NEXT_DATA__" type="application/json">{...}</script>.
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m?.[1]) return [];
  try {
    const data = JSON.parse(m[1]);
    const timeline = data?.props?.pageProps?.timeline?.entries ?? data?.props?.pageProps?.contextProvider?.tweets ?? [];
    const tweets: SyndicationTweet[] = [];
    const stack: unknown[] = [data];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      const obj = node as Record<string, unknown>;
      if (typeof obj.id_str === "string" && (typeof obj.full_text === "string" || typeof obj.text === "string")) {
        tweets.push(obj as SyndicationTweet);
      }
      for (const v of Object.values(obj)) if (v && typeof v === "object") stack.push(v);
    }
    if (tweets.length) return tweets;
    return Array.isArray(timeline) ? timeline : [];
  } catch (e) {
    console.log("[social-feed] x parse fail", e instanceof Error ? e.message : e);
    return [];
  }
}

async function fetchTwitter(handle: string): Promise<SocialItem[]> {
  // Primary: Twitter's public syndication endpoint (no auth). This is what
  // publish.twitter.com / oEmbed embeds use. Returns HTML w/ __NEXT_DATA__ JSON.
  const endpoints = [
    `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}?showReplies=false`,
    `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`,
  ];
  for (const url of endpoints) {
    try {
      const res = await fetchWithTimeout(url, 8_000);
      if (!res.ok) continue;
      const html = await res.text();
      const tweets = parseSyndicationHtml(html);
      if (!tweets.length) continue;
      const items: SocialItem[] = [];
      for (const t of tweets) {
        const id = t.id_str ?? "";
        const text = (t.full_text ?? t.text ?? "").trim();
        if (!id || !text) continue;
        const published_at = t.created_at
          ? new Date(t.created_at).toISOString()
          : new Date().toISOString();
        const image_url =
          t.mediaDetails?.[0]?.media_url_https ??
          t.entities?.media?.[0]?.media_url_https ??
          null;
        items.push({
          id: hashId(`x:${handle}:${id}`),
          source: "x",
          source_label: `@${handle} on X`,
          url: `https://x.com/${handle}/status/${id}`,
          text: stripHtml(text),
          image_url,
          published_at,
        });
      }
      // Dedupe by id and sort newest first.
      const seen = new Set<string>();
      const unique = items.filter((i) => {
        if (seen.has(i.id)) return false;
        seen.add(i.id);
        return true;
      });
      unique.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
      if (unique.length) return unique;
    } catch (e) {
      console.log("[social-feed] x endpoint fail", url, e instanceof Error ? e.message : e);
    }
  }
  return [];
}

async function getOrFetch(key: string, fn: () => Promise<SocialItem[]>): Promise<SocialItem[]> {
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.items;
  const items = await fn();
  if (items.length) memoryCache.set(key, { at: Date.now(), items });
  else if (cached) return cached.items; // stale-on-fail
  return items;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const params =
      req.method === "POST"
        ? ((await req.json().catch(() => ({}))) as { telegram?: string; x?: string })
        : Object.fromEntries(new URL(req.url).searchParams.entries());
    const tg = (params.telegram ?? "ogupdates").replace(/^@/, "");
    const x = (params.x ?? "ogscanfun").replace(/^@/, "");

    const [telegram, twitter] = await Promise.all([
      getOrFetch(`tg:${tg}`, () => fetchTelegram(tg)),
      getOrFetch(`x:${x}`, () => fetchTwitter(x)),
    ]);

    return json({
      telegram,
      twitter,
      fetched_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[social-feed] fatal", e instanceof Error ? e.message : e);
    return json({ telegram: [], twitter: [], error: "social fetch failed" }, 500);
  }
});
