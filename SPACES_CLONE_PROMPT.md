# SolTools Spaces — Standalone Clone Build Prompt

This document is a self-contained brief for rebuilding the **Spaces** voice-room feature from the SolTools mobile app as a **standalone web app**. The web app will then be embedded back into the SolTools mobile app as a WebView (the same pattern used for OGScan tools), so this code is no longer maintained inside the React Native project.

The prompt below is meant to be copy-pasted into a new Rork (or any AI builder) project. All necessary source from the current implementation is mirrored at the bottom so the new build is a 1:1 port.

---

## Build prompt (paste into a fresh project)

> Build a production-grade **Spaces** web app — Twitter/X-Spaces-style live audio rooms — that matches the design and behavior of the React Native source dumped below. Target stack: **Next.js (App Router) + TypeScript + Tailwind/CSS modules + Supabase + LiveKit Web SDK**.
>
> **Core requirements**
> 1. Pixel-faithful port of the two main screens:
>    - **Spaces list** (`/spaces`): hero panel with live count, search, tab rail (On air / Soon / Alerts / All), category chips (Alpha, Whales, AI, TA, Memes, Launches), room capsules.
>    - **Space detail** (`/space/[id]`): host header, banner, LiveKit voice panel, pinned note, live poll, stage grid of speakers, raised hands, listener grid, live chat, bottom dock (mic, hand, react, leave). Animated speaking rings (concentric pulses) on the mic when audio is detected, like a phone-call indicator.
> 2. **Audio engine**: LiveKit Web SDK (`livekit-client@2.5.10`). Mic permission preflight via `getUserMedia`. Echo cancellation, noise suppression, AGC. Active speakers event drives the ring animation. Listeners cannot publish audio — `canPublish` must reflect role (`host` / `co-host` / `speaker` only). Host force-mute over LiveKit data channel with `{ kind: "force-mute", target: identity | "*" }`.
> 3. **Supabase schema** (already deployed — see migrations dumped below). Tables: `livekit_rooms`, `livekit_participants`, `space_messages`, `space_message_likes`. RPCs: `create_space`, `start_space`, `join_space`, `leave_space`, `end_space`, `set_space_mute`, `set_space_hand`, `set_space_participant_role`, `set_space_participant_mute`, `remove_space_participant`, `mute_all_space_participants`, `heartbeat_space_participant`, `send_space_message`, `add_space_reaction`, `toggle_space_message_like`, `pin_space_message`, `update_space_banner`, `set_space_pin`, `set_space_poll`, `vote_space_poll`, `follow_space`.
> 4. **Realtime**: Supabase Realtime channels for `livekit_rooms`, `livekit_participants`, `space_messages` + broadcast channel `space-meta-{id}` for instant pin/poll/vote nudges.
> 5. **Edge function** `livekit-token` (and fallback `voice-token`) returns `{ token, url, room, identity }`. Already deployed.
> 6. **Auth**: Supabase Auth — same project as the mobile app. All gated actions require a session.
> 7. **Image upload** for banners → Supabase Storage `posts` bucket (same as mobile app uses via `uploadPostImage`).
> 8. **Design tokens** (match the mobile app exactly):
>    - Background: `#020202` (`Colors.ink`)
>    - Card surface: `rgba(255,255,255,0.045)` over ink
>    - Accent gold: `#F4C65B` (`Colors.goldBright`)
>    - Mint: `#3DDC97`, Cyan: `#62D0FF`, Violet: `#A479FF`, Rose: `#FF4D6D`, Orange: `#FF7A3D`, Silver: `#DDE3EC`
>    - Type: 900 weight headlines with tight negative tracking, 800/650 body, uppercase 1.1-letter-spacing eyebrows
>    - Pills, capsules, dashed empty states, gradient hero rings
> 9. **Mobile-first responsive**: 100% of UX must work on phones (375px width) since the app embeds this in a WebView. Use safe-area inset env vars and lock to dark mode.
> 10. **Sharing**: `/space/{id}` deep links share via Web Share API and `navigator.clipboard`.
>
> **Out of scope for the web app**
> - Native push notifications (mobile app handles).
> - Wallet connect (mobile app handles).
>
> **Routing**: keep the two routes `/spaces` and `/space/[id]` exactly so the mobile WebView can deep-link by path.
>
> **Performance**
> - React Query for all server reads (15s staleTime for the list, 5s for participants, 10s refetchInterval on participants).
> - Heartbeat every 30s while connected.
> - Cache LiveKit token until expiry.
>
> **Quality bar**: Apple-level. Snap-haptic-equivalent micro-interactions (button press scale, ring pulses, floater emoji reactions, animated wave orb). No "AI slop" — keep the gold/dark cinematic aesthetic.

---

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_LIVEKIT_URL=wss://...
```

LiveKit JWTs are issued by the existing `livekit-token` Supabase Edge Function — call it with the user's Supabase access token in the `Authorization` header. Payload:

```json
{ "room": "<livekit_room_name>", "roomName": "<same>", "identity": "<userId>", "name": "<displayName>" }
```

---

## File map of the current React Native implementation

These are the files copied below — port each one to the web stack:

| Source path | Purpose |
| --- | --- |
| `expo/app/spaces.tsx` | List screen (hero, tabs, search, categories, capsules, create modal) |
| `expo/app/space/[id].tsx` | Detail screen (stage, chat, controls, host tools, pin, poll, banner, admin sheet) |
| `expo/components/space/LiveKitVoice.tsx` | LiveKit WebRTC bridge (in mobile uses hidden WebView; on web becomes direct `livekit-client` usage) |
| `expo/providers/social-provider.tsx` (Spaces slice, lines ~88–1460 and ~2395–2510) | TS types, queries, mutations, realtime wiring |
| `expo/lib/api/livekit.ts` | Edge-function token fetcher |
| `supabase/migrations/202605100002_spaces_voice_rooms.sql` | Initial schema |
| `supabase/migrations/202605110003_spaces_complete_rebuild.sql` | Rebuild + RPCs |
| `supabase/migrations/202605110007_spaces_advanced_features.sql` | Pin, poll, banner, force mute, mute all |
| `supabase/functions/livekit-token/index.ts` | Edge function source |

---

## TypeScript domain types (port verbatim)

```ts
export interface SpacePoll {
  id: string;
  q: string;
  options: string[];
  voters: Record<string, number>;
}

export interface Space {
  id: string;
  title: string;
  topic: string;
  description: string;
  hostId?: string | null;
  hostHandle: string;
  hostName: string;
  livekitRoomName: string;
  coHosts: string[];
  speakers: number;
  listeners: number;
  isLive: boolean;
  status: "scheduled" | "live" | "ended" | "cancelled";
  scheduledAt?: number;
  startedAt?: number;
  endedAt?: number;
  createdAt: number;
  category: "alpha" | "whales" | "ai" | "ta" | "memes" | "launches";
  accent: [string, string];
  recording: boolean;
  raisedHands: number;
  bannerUrl?: string | null;
  viewersNow: number;
  peakListeners: number;
  totalViews: number;
  pinnedNote?: string | null;
  currentPoll?: SpacePoll | null;
}

export interface SpaceParticipant {
  id: string;
  roomId: string;
  userId?: string | null;
  identity: string;
  handle: string;
  name: string;
  avatarColor: string;
  role: "host" | "co-host" | "speaker" | "listener";
  muted: boolean;
  handRaised: boolean;
  speaking: boolean;
  joinedAt: number;
}

export interface SpaceMessage {
  id: string;
  roomId: string;
  userId: string;
  authorHandle: string;
  authorName: string;
  authorColor: string;
  body: string;
  type: "text" | "system" | "ticker" | "reaction";
  createdAt: number;
  likes: number;
  pinned: boolean;
}

export interface CreateSpaceInput {
  title: string;
  topic?: string;
  description?: string;
  category?: Space["category"];
  scheduledAt?: number | null;
  recording?: boolean;
  bannerUrl?: string | null;
}
```

---

## LiveKit web engine (port of `LiveKitVoice.tsx`)

In the mobile app this runs inside a hidden WebView. On the web port, you can use `livekit-client` directly — replicate the same callback/event API so the React UI doesn't change:

```ts
// useLiveKitVoice.ts (sketch — implement in the new web app)
import { Room, RoomEvent, RemoteTrack } from "livekit-client";

export type LiveKitVoiceEvent =
  | { type: "ready" }
  | { type: "connected"; identity: string }
  | { type: "disconnected" }
  | { type: "state"; state: string }
  | { type: "mic"; enabled: boolean }
  | { type: "speakers"; identities: string[] }
  | { type: "force-muted-by"; from: string }
  | { type: "error"; message: string };
```

Behavior to replicate exactly:
- On connect: subscribe to audio tracks, attach to `<audio>` elements, request mic permission upfront, then start muted even if `canPublish`.
- `setCanPublish(false)` must `setMicrophoneEnabled(false)` immediately.
- `forceMuteIdentity(id)` publishes a data packet `{ kind: "force-mute", target: id }` (reliable). Listeners disable mic when they receive it for their identity (or `"*"`).
- Active speakers event drives the visual ring.

---

## Mobile screens — full source

> The sources below are referenced (not duplicated) because of size. When porting, open the originals in the SolTools mobile repo at the listed paths.

- **`expo/app/spaces.tsx`** — Spaces list screen (~800 LOC)
- **`expo/app/space/[id].tsx`** — Space detail screen (~1500 LOC)
- **`expo/components/space/LiveKitVoice.tsx`** — Bridge component (~300 LOC)
- **`expo/providers/social-provider.tsx`** — All Spaces queries + mutations (Spaces slice, ~600 LOC)

When porting, every JSX element, animation, color, and copy string must match. Keep `testID` props as `data-testid` so e2e tests carry over.

---

## Supabase backend

The Supabase project already has every table, RPC, RLS policy, and Edge Function deployed. The web app should connect to the **same Supabase project** as the mobile app so a Space created on web shows up on mobile and vice versa.

Migrations to read:
- `202605100002_spaces_voice_rooms.sql` — initial tables (`livekit_rooms`, `livekit_participants`, `space_messages`)
- `202605110003_spaces_complete_rebuild.sql` — RPC layer
- `202605110007_spaces_advanced_features.sql` — banner, pin, poll, force-mute, mute-all, message likes, message pin

---

## Integration back into the SolTools mobile app

After the web app is live at e.g. `https://spaces.soltools.app`:

1. Set `EXPO_PUBLIC_SPACES_WEB_URL=https://spaces.soltools.app` on the mobile project.
2. The mobile routes `/spaces` and `/space/[id]` are now thin React Native `WebView` shells (already added in this PR — see `expo/app/spaces.tsx` and `expo/app/space/[id].tsx`).
3. Auth handoff: pass the Supabase access token as a query param (`?t=<jwt>`) or `postMessage` after load. The web app should `supabase.auth.setSession({ access_token, refresh_token })` if present.
4. Native mic permission for the WebView is granted via `onPermissionRequest={(e) => e.grant()}` and `mediaCapturePermissionGrantType="grant"` (already in the embed shell).

---

## Acceptance checklist for the new web app

- [ ] `/spaces` renders hero, search, tabs, category chips, capsules — pixel-faithful.
- [ ] Create Space modal with cover banner upload, topic, schedule toggle, recording toggle, category chip rail.
- [ ] `/space/[id]` renders banner, host header, LiveKit panel, pinned note, poll, stage grid (with speaking ring), raised hands, listener grid, chat, bottom dock.
- [ ] Mic permission preflight; speaking ring animation matches mobile.
- [ ] Listeners cannot publish audio; host force-mute & mute-all work via LiveKit data channel.
- [ ] Pin a note, launch a poll, vote, close poll — all persist via RPCs and broadcast via Supabase Realtime.
- [ ] Heartbeat every 30s while connected.
- [ ] Banner edit (host only) uploads to Supabase Storage and updates the room row.
- [ ] Share & Copy-link buttons work via Web Share API.
- [ ] Embedded inside the SolTools mobile WebView — mic works, no scroll jank, safe-area respected.

— End of brief.
