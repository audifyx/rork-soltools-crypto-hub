import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { setAudioModeAsync, requestRecordingPermissionsAsync } from "expo-audio";

/**
 * LiveKitVoice
 *
 * Real-time audio engine for Spaces. Runs the official `livekit-client` web
 * SDK inside a hidden WebView so we get true WebRTC audio in Expo Go (no
 * custom native modules required). The host RN screen drives it through an
 * imperative ref and listens for status callbacks.
 */
export type LiveKitVoiceHandle = {
  setMicEnabled: (enabled: boolean) => void;
  forceMuteIdentity: (identity: string) => void;
  forceMuteAll: () => void;
  leave: () => void;
  setCanPublish: (enabled: boolean) => void;
};

export type LiveKitVoiceEvent =
  | { type: "ready" }
  | { type: "connected"; identity: string }
  | { type: "disconnected" }
  | { type: "state"; state: string }
  | { type: "mic"; enabled: boolean }
  | { type: "speakers"; identities: string[] }
  | { type: "force-muted-by"; from: string }
  | { type: "error"; message: string };

type Props = {
  url: string;
  token: string;
  canPublish: boolean;
  myIdentity: string;
  onEvent?: (event: LiveKitVoiceEvent) => void;
};

const HTML = `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<style>
  html,body{margin:0;padding:0;background:transparent;color:#fff;font-family:-apple-system,system-ui,sans-serif;}
  body{display:flex;align-items:center;justify-content:center;height:100vh;font-size:12px;opacity:0.5}
  audio{display:none}
</style>
</head><body>
<div id="status">voice engine</div>
<script src="https://cdn.jsdelivr.net/npm/livekit-client@2.5.10/dist/livekit-client.umd.min.js"></script>
<script>
(function(){
  var LK = window.LivekitClient || window.LiveKit || {};
  var Room = LK.Room;
  var RoomEvent = LK.RoomEvent || {};
  var DataPacket_Kind = LK.DataPacket_Kind || { RELIABLE: 0 };
  var room = null;
  var canPublish = false;
  var myIdentity = '';

  function post(type, payload){
    try{
      var msg = JSON.stringify(Object.assign({type:type}, payload||{}));
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(msg);
      } else if (window.parent) {
        window.parent.postMessage(msg, '*');
      }
    }catch(e){}
  }

  function attachAudio(track){
    try{
      var el = track.attach();
      el.autoplay = true;
      el.playsInline = true;
      document.body.appendChild(el);
    }catch(e){ post('error',{message:'attach failed: '+e}); }
  }

  async function connect(url, token, publish, identity){
    if (!Room) { post('error',{message:'livekit-client failed to load'}); return; }
    canPublish = !!publish;
    myIdentity = identity || '';
    try{
      room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: { echoCancellation:true, noiseSuppression:true, autoGainControl:true }
      });
      room.on(RoomEvent.TrackSubscribed, function(track){
        if (track && track.kind === 'audio') attachAudio(track);
      });
      room.on(RoomEvent.TrackUnsubscribed, function(track){
        try { track.detach().forEach(function(el){ el.remove(); }); } catch(e){}
      });
      room.on(RoomEvent.ActiveSpeakersChanged, function(speakers){
        var ids = (speakers||[]).map(function(s){ return s.identity; });
        post('speakers',{identities: ids});
      });
      room.on(RoomEvent.Disconnected, function(){ post('disconnected'); });
      room.on(RoomEvent.ConnectionStateChanged, function(state){ post('state',{state:String(state)}); });
      room.on(RoomEvent.DataReceived, function(payload, participant){
        try{
          var text = new TextDecoder().decode(payload);
          var data = JSON.parse(text);
          if (data && data.kind === 'force-mute' && (data.target === myIdentity || data.target === '*')) {
            setMic(false);
            post('force-muted-by',{from: participant ? participant.identity : 'host'});
          }
        }catch(e){}
      });
      await room.connect(url, token, { autoSubscribe: true });
      post('connected',{identity: room.localParticipant.identity});
      // Always pre-flight the microphone permission so iOS/Android grant
      // the WebView access before we actually unmute. Otherwise the first
      // unmute tap silently fails because getUserMedia was never invoked.
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          var pre = await navigator.mediaDevices.getUserMedia({ audio: true });
          pre.getTracks().forEach(function(t){ try { t.stop(); } catch(e){} });
        }
      } catch(e) {
        post('error',{message:'mic permission: '+(e && e.message ? e.message : e)});
      }
      if (canPublish) {
        try { await room.localParticipant.setMicrophoneEnabled(false); } catch(e){}
      }
    }catch(e){
      post('error',{message: 'connect failed: '+(e && e.message ? e.message : e)});
    }
  }

  async function setMic(enabled){
    if (!room) return;
    if (!canPublish && enabled) {
      post('error',{message:'Not on stage. Raise your hand first.'});
      return;
    }
    try {
      await room.localParticipant.setMicrophoneEnabled(!!enabled);
      post('mic',{enabled: !!enabled});
    } catch(e){
      post('error',{message:'mic toggle failed: '+(e && e.message ? e.message : e)});
    }
  }

  function setCanPublish(enabled){
    canPublish = !!enabled;
    if (!canPublish && room) {
      try { room.localParticipant.setMicrophoneEnabled(false); } catch(e){}
    }
  }

  async function broadcast(obj){
    if (!room) return;
    try{
      var bytes = new TextEncoder().encode(JSON.stringify(obj));
      await room.localParticipant.publishData(bytes, DataPacket_Kind.RELIABLE);
    }catch(e){ post('error',{message:'broadcast failed: '+e}); }
  }

  function leave(){
    try{ if (room) room.disconnect(); }catch(e){}
    room = null;
  }

  function handleMessage(raw){
    try{
      var msg = JSON.parse(raw);
      if (!msg || !msg.cmd) return;
      if (msg.cmd === 'connect') connect(msg.url, msg.token, msg.canPublish, msg.identity);
      else if (msg.cmd === 'mic') setMic(!!msg.enabled);
      else if (msg.cmd === 'can-publish') setCanPublish(!!msg.enabled);
      else if (msg.cmd === 'force-mute') broadcast({kind:'force-mute', target: msg.target||'*'});
      else if (msg.cmd === 'leave') leave();
    }catch(e){ post('error',{message:'bad cmd: '+e}); }
  }

  window.addEventListener('message', function(ev){ handleMessage(ev.data); });
  document.addEventListener('message', function(ev){ handleMessage(ev.data); });
  post('ready');
})();
</script>
</body></html>`;

const LiveKitVoice = forwardRef<LiveKitVoiceHandle, Props>(function LiveKitVoice(
  { url, token, canPublish, myIdentity, onEvent },
  ref,
) {
  const webRef = useRef<WebView | null>(null);
  const readyRef = useRef<boolean>(false);
  const pendingRef = useRef<string[]>([]);

  const send = useCallback((payload: Record<string, unknown>) => {
    const json = JSON.stringify(payload);
    if (readyRef.current && webRef.current) {
      const escaped = json.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      webRef.current.injectJavaScript(`(function(){try{window.dispatchEvent(new MessageEvent('message',{data:'${escaped}'}));}catch(e){}})();true;`);
    } else {
      pendingRef.current.push(json);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    setMicEnabled: (enabled: boolean) => send({ cmd: "mic", enabled }),
    forceMuteIdentity: (identity: string) => send({ cmd: "force-mute", target: identity }),
    forceMuteAll: () => send({ cmd: "force-mute", target: "*" }),
    leave: () => send({ cmd: "leave" }),
    setCanPublish: (enabled: boolean) => send({ cmd: "can-publish", enabled }),
  }), [send]);

  // Keep the bridge's `canPublish` flag synced when role changes after connect.
  useEffect(() => {
    if (readyRef.current) {
      send({ cmd: "can-publish", enabled: canPublish });
    }
  }, [canPublish, send]);

  // Configure the native audio session so LiveKit playback routes through the
  // loudspeaker (not the iOS earpiece) and works in silent mode. Also request
  // mic permission upfront so the WebView's getUserMedia call succeeds.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await requestRecordingPermissionsAsync();
        if (cancelled) return;
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
          shouldPlayInBackground: false,
          interruptionMode: "mixWithOthers",
          interruptionModeAndroid: "duckOthers",
          shouldRouteThroughEarpiece: false,
        });
      } catch (err) {
        console.log("[livekit] audio mode failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(e.nativeEvent.data) as LiveKitVoiceEvent & { state?: string; identities?: string[]; enabled?: boolean; identity?: string; from?: string; message?: string };
        if (data.type === "ready") {
          readyRef.current = true;
          send({ cmd: "connect", url, token, canPublish, identity: myIdentity });
          const queued = pendingRef.current.splice(0);
          queued.forEach((raw) => {
            const escaped = raw.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
            webRef.current?.injectJavaScript(`(function(){try{window.dispatchEvent(new MessageEvent('message',{data:'${escaped}'}));}catch(e){}})();true;`);
          });
        }
        onEvent?.(data as LiveKitVoiceEvent);
      } catch {
        // ignore malformed messages
      }
    },
    [canPublish, myIdentity, onEvent, send, token, url],
  );

  const source = useMemo(() => ({ html: HTML, baseUrl: "https://livekit-bridge.local" }), []);

  return (
    <View style={styles.host} pointerEvents="none">
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={source}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        allowsProtectedMedia
        onPermissionRequest={(event: { permissions: string[]; grant: () => void; deny: () => void }) => {
          try {
            event.grant();
          } catch {
            // ignore
          }
        }}
        style={styles.web}
        androidLayerType={Platform.OS === "android" ? "hardware" : undefined}
        setSupportMultipleWindows={false}
        scrollEnabled={false}
      />
    </View>
  );
});

export default LiveKitVoice;

const styles = StyleSheet.create({
  host: { position: "absolute", width: 1, height: 1, opacity: 0, top: -10, left: -10 },
  web: { flex: 1, backgroundColor: "transparent" },
});
