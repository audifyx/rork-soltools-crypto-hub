import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  Bell,
  Calendar,
  Clock,
  Eye,
  Headphones,
  Mic,
  Radio,
  Sparkles,
  Tv2,
  Users,
  Video,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import AppBackground from "@/components/ui/AppBackground";
import Colors from "@/constants/colors";
import { navigateBack } from "@/lib/navigation";

const NOTIFY_KEY = "streams.notifyMe.v1";

type LucideIcon = React.ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

type ScheduleItem = {
  id: string;
  title: string;
  host: string;
  startsIn: string;
  type: "Show" | "AMA" | "Pump" | "Trading";
  Icon: LucideIcon;
  tone: string;
};

const SCHEDULE: ScheduleItem[] = [
  {
    id: "s1",
    title: "Solana Alpha Hour",
    host: "@degenking",
    startsIn: "in 2h",
    type: "Show",
    Icon: Tv2,
    tone: Colors.cyan,
  },
  {
    id: "s2",
    title: "Live Trade w/ MintMike",
    host: "@mintmike",
    startsIn: "tonight",
    type: "Trading",
    Icon: Video,
    tone: Colors.mint,
  },
  {
    id: "s3",
    title: "Founder AMA · $RORK",
    host: "@rorklabs",
    startsIn: "tomorrow",
    type: "AMA",
    Icon: Mic,
    tone: Colors.orange,
  },
  {
    id: "s4",
    title: "Late Night Pumps",
    host: "@nightowl",
    startsIn: "Sat 11PM",
    type: "Pump",
    Icon: Headphones,
    tone: Colors.violet,
  },
];

export default function StreamsScreen() {
  const router = useRouter();
  const [notifyMe, setNotifyMe] = useState<boolean>(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const wave = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(NOTIFY_KEY)
      .then((v) => {
        if (v === "1") setNotifyMe(true);
      })
      .catch((e) => console.log("[streams] read notify error", e));
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(wave, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [wave]);

  const onToggleNotify = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setNotifyMe((prev) => {
      const next = !prev;
      AsyncStorage.setItem(NOTIFY_KEY, next ? "1" : "0").catch(() => {});
      return next;
    });
  }, []);

  const heroPulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const heroPulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  const bars = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  return (
    <View style={styles.root} testID="streams-screen">
      <AppBackground variant="social" />
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <Pressable onPress={() => navigateBack(router, "/(tabs)/home")} style={styles.backBtn} hitSlop={8} testID="streams-back">
              <ArrowLeft color={Colors.text} size={18} strokeWidth={2.6} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={styles.eyebrow}>
                <Radio color={Colors.rose} size={13} strokeWidth={2.8} />
                <Text style={styles.eyebrowText}>STREAMS</Text>
              </View>
              <Text style={styles.title}>Live & shows</Text>
              <Text style={styles.sub}>Audio rooms, trading streams, AMAs.</Text>
            </View>
            <Pressable
              onPress={onToggleNotify}
              style={[
                styles.notifyBtn,
                notifyMe && {
                  backgroundColor: "rgba(85,245,178,0.12)",
                  borderColor: "rgba(85,245,178,0.45)",
                },
              ]}
              testID="streams-notify"
            >
              <Bell
                color={notifyMe ? Colors.mint : Colors.text}
                size={14}
                strokeWidth={2.6}
              />
              <Text
                style={[
                  styles.notifyText,
                  notifyMe && { color: Colors.mint },
                ]}
              >
                {notifyMe ? "Notify on" : "Notify me"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.hero}>
            <LinearGradient
              colors={["rgba(255,93,143,0.28)", "rgba(184,140,255,0.18)", "rgba(56,215,255,0.10)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.heroTopRow}>
              <View style={styles.comingPill}>
                <Sparkles color={Colors.violet} size={11} strokeWidth={3} />
                <Text style={styles.comingPillText}>COMING SOON</Text>
              </View>
              <View style={styles.soonPill}>
                <Clock color={Colors.text} size={10} strokeWidth={3} />
                <Text style={styles.soonPillText}>Q3</Text>
              </View>
            </View>

            <View style={styles.heroIconWrap}>
              <Animated.View
                style={[
                  styles.heroPulse,
                  {
                    transform: [{ scale: heroPulseScale }],
                    opacity: heroPulseOpacity,
                  },
                ]}
              />
              <LinearGradient
                colors={[Colors.rose, Colors.violet]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroIcon}
              >
                <Radio color={Colors.ink} size={36} strokeWidth={2.6} />
              </LinearGradient>
            </View>

            <Text style={styles.heroTitle}>Streams are coming</Text>
            <Text style={styles.heroBody}>
              Live trading rooms, AMAs with founders, audio shows and pump rallies — all natively
              inside the app. Tap notify to be first when we go on-air.
            </Text>

            <View style={styles.waveRow}>
              {bars.map((i) => {
                const delay = i / bars.length;
                const h = wave.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [
                    8 + ((i * 7) % 18),
                    24 + ((i * 11) % 22),
                    8 + ((i * 13) % 16),
                  ],
                });
                return (
                  <Animated.View
                    key={i}
                    style={[
                      styles.waveBar,
                      {
                        height: h,
                        opacity: 0.5 + (i % 3) * 0.15,
                        backgroundColor:
                          i % 3 === 0
                            ? Colors.rose
                            : i % 3 === 1
                              ? Colors.violet
                              : Colors.cyan,
                        transform: [{ translateY: delay * 2 }],
                      },
                    ]}
                  />
                );
              })}
            </View>

            <Pressable
              onPress={onToggleNotify}
              style={[styles.heroCta, notifyMe && styles.heroCtaOn]}
              testID="streams-hero-cta"
            >
              <Bell
                color={notifyMe ? Colors.mint : Colors.ink}
                size={14}
                strokeWidth={3}
              />
              <Text
                style={[styles.heroCtaText, notifyMe && { color: Colors.mint }]}
              >
                {notifyMe ? "You'll be notified" : "Notify me when live"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.featureRow}>
            <FeatureCard
              Icon={Mic}
              title="Audio rooms"
              body="Drop in like Twitter Spaces, no video needed."
              tone={Colors.orange}
            />
            <FeatureCard
              Icon={Video}
              title="Live trading"
              body="Watch traders execute trades on-chain in real time."
              tone={Colors.mint}
            />
            <FeatureCard
              Icon={Users}
              title="Co-host"
              body="Invite up to 8 speakers to host with you."
              tone={Colors.cyan}
            />
            <FeatureCard
              Icon={Zap}
              title="Tip live"
              body="Send SOL or any SPL token directly to the host."
              tone={Colors.rose}
            />
          </View>

          <View style={styles.scheduleHead}>
            <View style={styles.scheduleHeadLeft}>
              <Calendar color={Colors.violet} size={14} strokeWidth={2.8} />
              <Text style={styles.scheduleTitle}>Upcoming schedule</Text>
            </View>
            <View style={styles.previewPill}>
              <Text style={styles.previewPillText}>PREVIEW</Text>
            </View>
          </View>

          <View style={styles.scheduleList}>
            {SCHEDULE.map((s) => (
              <ScheduleRow key={s.id} item={s} />
            ))}
          </View>

          <Pressable
            style={styles.exploreBtn}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              router.push("/spaces");
            }}
            testID="streams-explore-spaces"
          >
            <View style={styles.exploreLeft}>
              <View style={styles.exploreIcon}>
                <Headphones color={Colors.cyan} size={16} strokeWidth={2.6} />
              </View>
              <View>
                <Text style={styles.exploreTitle}>Looking for Spaces?</Text>
                <Text style={styles.exploreSub}>
                  Audio rooms are live in the Spaces hub.
                </Text>
              </View>
            </View>
            <View style={styles.exploreCta}>
              <Text style={styles.exploreCtaText}>Open</Text>
            </View>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function FeatureCard({
  Icon,
  title,
  body,
  tone,
}: {
  Icon: LucideIcon;
  title: string;
  body: string;
  tone: string;
}) {
  return (
    <View style={[styles.featureCard, { borderColor: `${tone}33` }]}>
      <View style={[styles.featureIcon, { backgroundColor: `${tone}1A` }]}>
        <Icon color={tone} size={16} strokeWidth={2.8} />
      </View>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureBody}>{body}</Text>
    </View>
  );
}

function ScheduleRow({ item }: { item: ScheduleItem }) {
  return (
    <View style={[styles.scheduleRow, { borderColor: `${item.tone}33` }]}>
      <View style={[styles.scheduleIcon, { backgroundColor: `${item.tone}1A` }]}>
        <item.Icon color={item.tone} size={16} strokeWidth={2.6} />
      </View>
      <View style={styles.scheduleMid}>
        <View style={styles.scheduleTitleLine}>
          <Text style={styles.scheduleItemTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={[styles.scheduleType, { backgroundColor: `${item.tone}1A` }]}>
            <Text style={[styles.scheduleTypeText, { color: item.tone }]}>
              {item.type.toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={styles.scheduleMeta}>
          <Text style={styles.scheduleHost}>{item.host}</Text>
          <View style={styles.scheduleDot} />
          <Clock color={Colors.muted} size={10} strokeWidth={2.6} />
          <Text style={styles.scheduleWhen}>{item.startsIn}</Text>
        </View>
      </View>
      <View style={styles.scheduleEye}>
        <Eye color={Colors.muted} size={13} strokeWidth={2.6} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink, overflow: "hidden" },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 140 },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 6 },
  eyebrowText: {
    color: Colors.rose,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  title: {
    color: Colors.text,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 6,
  },
  sub: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 2 },

  notifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  notifyText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  hero: {
    marginTop: 18,
    padding: 22,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,93,143,0.3)",
    backgroundColor: Colors.card,
    overflow: "hidden",
    alignItems: "center",
  },
  heroTopRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  comingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(184,140,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(184,140,255,0.45)",
  },
  comingPillText: {
    color: Colors.violet,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  soonPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  soonPillText: {
    color: Colors.text,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },

  heroIconWrap: {
    marginTop: 18,
    width: 92,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
  },
  heroIcon: {
    width: 76,
    height: 76,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPulse: {
    position: "absolute",
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: Colors.rose,
  },

  heroTitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.6,
    marginTop: 16,
    textAlign: "center",
  },
  heroBody: {
    color: Colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 8,
  },

  waveRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 18,
    height: 32,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
  },

  heroCta: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: Colors.mint,
  },
  heroCtaOn: {
    backgroundColor: "rgba(85,245,178,0.14)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.5)",
  },
  heroCtaText: {
    color: Colors.ink,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
  },

  featureRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },
  featureCard: {
    flexBasis: "47.5%",
    flexGrow: 1,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: Colors.card,
  },
  featureIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  featureTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: -0.3,
    marginTop: 10,
  },
  featureBody: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
    marginTop: 4,
  },

  scheduleHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 10,
  },
  scheduleHeadLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  scheduleTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  previewPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  previewPillText: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  scheduleList: { gap: 10 },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: Colors.card,
  },
  scheduleIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  scheduleMid: { flex: 1, gap: 4 },
  scheduleTitleLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  scheduleItemTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  scheduleType: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  scheduleTypeText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  scheduleMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scheduleHost: { color: Colors.muted, fontSize: 11, fontWeight: "800" },
  scheduleDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.muted,
  },
  scheduleWhen: { color: Colors.muted, fontSize: 11, fontWeight: "700" },
  scheduleEye: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },

  exploreBtn: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.3)",
    backgroundColor: "rgba(56,215,255,0.06)",
  },
  exploreLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  exploreIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(56,215,255,0.16)",
  },
  exploreTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  exploreSub: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  exploreCta: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.cyan,
  },
  exploreCtaText: {
    color: Colors.ink,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
});
