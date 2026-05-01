import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  Eye,
  Flame,
  Gauge,
  Headphones,
  LineChart,
  Mic,
  Radar,
  Rocket,
  ScanLine,
  ShieldAlert,
  Sparkles,
  Target,
  Users,
  Wallet,
  Waves,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";

const SOLTOOLS_BUILD = "onboarding-v5";

type LucideIcon = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

type Chip = { label: string; Icon: LucideIcon };

type Slide = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  primary: string;
  secondary: string;
  HeroIcon: LucideIcon;
  chips: Chip[];
  visual: "wallet" | "ai" | "social" | "launch";
};

const SLIDES: Slide[] = [
  {
    id: "wallet",
    eyebrow: "01 · WALLET RADAR",
    title: "Track Any Wallet",
    body: "Monitor any Solana wallet in real-time. See all tokens, transactions, and PnL instantly.",
    primary: Colors.mint,
    secondary: Colors.cyan,
    HeroIcon: Wallet,
    chips: [
      { label: "Real-time Data", Icon: Activity },
      { label: "30+ Tools", Icon: Gauge },
      { label: "AI Analysis", Icon: Sparkles },
    ],
    visual: "wallet",
  },
  {
    id: "ai",
    eyebrow: "02 · INTELLIGENCE",
    title: "AI-Powered Analysis",
    body: "Deep rug detection, risk scoring, and intelligent market insights powered by Gemini AI.",
    primary: Colors.orange,
    secondary: Colors.rose,
    HeroIcon: Bot,
    chips: [
      { label: "Rug Detection", Icon: ShieldAlert },
      { label: "Risk Score", Icon: Gauge },
      { label: "Whale Alerts", Icon: Waves },
      { label: "Smart Analysis", Icon: Sparkles },
    ],
    visual: "ai",
  },
  {
    id: "social",
    eyebrow: "03 · SOCIAL EDGE",
    title: "Social Trading Lobbies",
    body: "Create voice-chat rooms, share charts in real-time, and build watchlists with your crew.",
    primary: Colors.cyan,
    secondary: Colors.mint,
    HeroIcon: Headphones,
    chips: [
      { label: "Voice Chat", Icon: Mic },
      { label: "Shared Charts", Icon: LineChart },
      { label: "Live Watchlists", Icon: Eye },
      { label: "Crew", Icon: Users },
    ],
    visual: "social",
  },
  {
    id: "launch",
    eyebrow: "04 · ALPHA ENGINE",
    title: "Launch Pad & Sniper",
    body: "Discover new launches, snipe liquidity pools, and catch the next 100x before everyone else.",
    primary: Colors.rose,
    secondary: Colors.orange,
    HeroIcon: Rocket,
    chips: [
      { label: "Token Sniper", Icon: Target },
      { label: "LP Scanner", Icon: Radar },
      { label: "New Launches", Icon: Flame },
      { label: "Alpha Alerts", Icon: Bell },
    ],
    visual: "launch",
  },
];

const { width: WINDOW_WIDTH } = Dimensions.get("window");

export default function SolToolsWelcomeScreen() {
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollX = useRef<Animated.Value>(new Animated.Value(0)).current;

  const splashScale = useRef<Animated.Value>(new Animated.Value(0.86)).current;
  const splashOpacity = useRef<Animated.Value>(new Animated.Value(1)).current;
  const glowPulse = useRef<Animated.Value>(new Animated.Value(0)).current;
  const contentOpacity = useRef<Animated.Value>(new Animated.Value(0)).current;
  const contentRise = useRef<Animated.Value>(new Animated.Value(28)).current;
  const ctaScale = useRef<Animated.Value>(new Animated.Value(1)).current;

  useEffect(() => {
    console.log("SolTools onboarding mounted", { build: SOLTOOLS_BUILD });

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    Animated.sequence([
      Animated.spring(splashScale, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      Animated.delay(900),
      Animated.parallel([
        Animated.timing(splashOpacity, {
          toValue: 0,
          duration: 460,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 640,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(contentRise, {
          toValue: 0,
          duration: 640,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(({ finished }) => {
      if (finished) setShowSplash(false);
    });

    return () => {
      pulseLoop.stop();
    };
  }, [contentOpacity, contentRise, glowPulse, splashOpacity, splashScale]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      scrollX.setValue(x);
      const idx = Math.round(x / WINDOW_WIDTH);
      if (idx !== activeIndex && idx >= 0 && idx < SLIDES.length) {
        setActiveIndex(idx);
        Haptics.selectionAsync().catch(() => {});
      }
    },
    [activeIndex, scrollX]
  );

  const goNext = useCallback(() => {
    const next = Math.min(activeIndex + 1, SLIDES.length - 1);
    if (next === activeIndex) {
      console.log("SolTools onboarding finished, entering app");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace("/home");
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    scrollRef.current?.scrollTo({ x: next * WINDOW_WIDTH, y: 0, animated: true });
    setActiveIndex(next);
  }, [activeIndex]);

  const handleCtaPressIn = useCallback(() => {
    Animated.spring(ctaScale, { toValue: 0.96, friction: 6, tension: 120, useNativeDriver: true }).start();
  }, [ctaScale]);
  const handleCtaPressOut = useCallback(() => {
    Animated.spring(ctaScale, { toValue: 1, friction: 5, tension: 110, useNativeDriver: true }).start();
  }, [ctaScale]);

  const glowScale = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const glowOpacity = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.34, 0.74] });

  const isLast = activeIndex === SLIDES.length - 1;
  const activeSlide = SLIDES[activeIndex];

  return (
    <View style={styles.root} testID="soltools-root">
      <StatusBar style="light" />
      <LinearGradient
        colors={["#020506", "#06120F", "#020708"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.background}
      >
        <View style={[styles.orb, styles.orbOne, { backgroundColor: `${activeSlide.primary}22` }]} />
        <View style={[styles.orb, styles.orbTwo, { backgroundColor: `${activeSlide.secondary}1A` }]} />

        <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
          <Animated.View
            style={[styles.content, { opacity: contentOpacity, transform: [{ translateY: contentRise }] }]}
            testID="soltools-onboarding"
          >
            <View style={styles.topBar}>
              <View style={styles.brandRow}>
                <LogoMark primary={activeSlide.primary} secondary={activeSlide.secondary} />
                <View>
                  <Text style={styles.brandName}>SOL TOOLS</Text>
                  <View style={styles.brandTagRow}>
                    <View style={[styles.tagDot, { backgroundColor: activeSlide.primary }]} />
                    <Text style={styles.brandTag}>PRO TRADING SUITE · V5</Text>
                  </View>
                </View>
              </View>
              <Pressable onPress={goNext} hitSlop={12} testID="skip-button">
                <Text style={styles.skipText}>{isLast ? "" : "Skip"}</Text>
              </Pressable>
            </View>

            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              decelerationRate="fast"
              style={styles.pager}
              testID="onboarding-pager"
            >
              {SLIDES.map((slide, i) => (
                <SlideView
                  key={slide.id}
                  slide={slide}
                  index={i}
                  scrollX={scrollX}
                  glowScale={glowScale}
                  glowOpacity={glowOpacity}
                />
              ))}
            </ScrollView>

            <View style={styles.bottomDock}>
              <View style={styles.dotsRow} testID="page-dots">
                {SLIDES.map((s, i) => {
                  const isActive = i === activeIndex;
                  return (
                    <View
                      key={s.id}
                      style={[
                        styles.dot,
                        isActive && styles.dotActive,
                        isActive && { backgroundColor: activeSlide.primary, width: 26 },
                      ]}
                    />
                  );
                })}
              </View>

              <Animated.View style={{ transform: [{ scale: ctaScale }] }}>
                <Pressable
                  onPress={goNext}
                  onPressIn={handleCtaPressIn}
                  onPressOut={handleCtaPressOut}
                  style={styles.ctaButton}
                  testID="next-button"
                >
                  <LinearGradient
                    colors={[activeSlide.primary, activeSlide.secondary]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.ctaGradient}
                  >
                    <Text style={styles.ctaText}>{isLast ? "Enter SolTools" : "Next"}</Text>
                    <ArrowRight color={Colors.ink} size={20} strokeWidth={3} />
                  </LinearGradient>
                </Pressable>
              </Animated.View>

              <Text style={styles.footerHint}>
                {isLast ? "Tap Enter to launch the suite" : `${activeIndex + 1} of ${SLIDES.length}`}
              </Text>
            </View>
          </Animated.View>

          {showSplash ? (
            <Animated.View pointerEvents="none" style={[styles.splashOverlay, { opacity: splashOpacity }]} testID="soltools-splash">
              <Animated.View
                style={[
                  styles.splashGlow,
                  { opacity: glowOpacity, transform: [{ scale: glowScale }] },
                ]}
              />
              <Animated.View style={[styles.splashLogoWrap, { transform: [{ scale: splashScale }] }]}>
                <LogoMark primary={Colors.mint} secondary={Colors.cyan} large />
                <Text style={styles.splashTitle}>SOL TOOLS</Text>
                <Text style={styles.splashSubtitle}>PRO TRADING SUITE · V5</Text>
              </Animated.View>
            </Animated.View>
          ) : null}
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

function SlideView({
  slide,
  index,
  scrollX,
  glowScale,
  glowOpacity,
}: {
  slide: Slide;
  index: number;
  scrollX: Animated.Value;
  glowScale: Animated.AnimatedInterpolation<number>;
  glowOpacity: Animated.AnimatedInterpolation<number>;
}) {
  const inputRange = [
    (index - 1) * WINDOW_WIDTH,
    index * WINDOW_WIDTH,
    (index + 1) * WINDOW_WIDTH,
  ];
  const titleTranslate = scrollX.interpolate({
    inputRange,
    outputRange: [40, 0, -40],
    extrapolate: "clamp",
  });
  const titleOpacity = scrollX.interpolate({
    inputRange,
    outputRange: [0.2, 1, 0.2],
    extrapolate: "clamp",
  });
  const heroScale = scrollX.interpolate({
    inputRange,
    outputRange: [0.82, 1, 0.82],
    extrapolate: "clamp",
  });

  const { HeroIcon } = slide;

  return (
    <View style={styles.slide} testID={`slide-${slide.id}`}>
      <View style={styles.slideInner}>
        <Animated.View style={[styles.heroWrap, { transform: [{ scale: heroScale }] }]} testID={`slide-visual-${slide.id}`}>
          <Animated.View
            style={[
              styles.heroGlow,
              {
                backgroundColor: `${slide.primary}33`,
                opacity: glowOpacity,
                transform: [{ scale: glowScale }],
              },
            ]}
          />
          <View style={[styles.heroRingOuter, { borderColor: `${slide.primary}33` }]} />
          <View style={[styles.heroRingInner, { borderColor: `${slide.secondary}33` }]} />

          <SlideArtwork slide={slide} />

          <View style={[styles.heroIconCircle, { borderColor: `${slide.primary}66` }]}>
            <LinearGradient
              colors={[`${slide.primary}33`, `${slide.secondary}22`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroIconGradient}
            >
              <HeroIcon color={slide.primary} size={42} strokeWidth={2.4} />
            </LinearGradient>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.copyWrap,
            { opacity: titleOpacity, transform: [{ translateY: titleTranslate }] },
          ]}
        >
          <Text style={[styles.eyebrow, { color: slide.primary }]}>{slide.eyebrow}</Text>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.body}>{slide.body}</Text>

          <View style={styles.chipsWrap}>
            {slide.chips.map((chip) => (
              <View
                key={chip.label}
                style={[styles.chip, { borderColor: `${slide.primary}44` }]}
                testID={`chip-${slide.id}-${chip.label}`}
              >
                <chip.Icon color={slide.primary} size={14} strokeWidth={2.5} />
                <Text style={styles.chipText}>{chip.label}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

function SlideArtwork({ slide }: { slide: Slide }) {
  if (slide.visual === "wallet") {
    return (
      <View style={styles.artBackdrop} pointerEvents="none">
        <View style={[styles.miniCard, { top: 6, left: 0, borderColor: `${slide.primary}33` }]}>
          <View style={[styles.miniDot, { backgroundColor: slide.primary }]} />
          <View>
            <Text style={styles.miniLabel}>SOL</Text>
            <Text style={[styles.miniValue, { color: slide.primary }]}>+12.4%</Text>
          </View>
        </View>
        <View style={[styles.miniCard, { bottom: 8, right: 0, borderColor: `${slide.secondary}33` }]}>
          <Activity color={slide.secondary} size={14} strokeWidth={2.5} />
          <View>
            <Text style={styles.miniLabel}>PnL</Text>
            <Text style={[styles.miniValue, { color: slide.secondary }]}>$48,210</Text>
          </View>
        </View>
      </View>
    );
  }
  if (slide.visual === "ai") {
    return (
      <View style={styles.artBackdrop} pointerEvents="none">
        <View style={[styles.miniCard, { top: 0, right: 0, borderColor: `${slide.primary}33` }]}>
          <ShieldAlert color={slide.primary} size={14} strokeWidth={2.5} />
          <View>
            <Text style={styles.miniLabel}>RISK</Text>
            <Text style={[styles.miniValue, { color: slide.primary }]}>LOW · 12</Text>
          </View>
        </View>
        <View style={[styles.miniCard, { bottom: 12, left: 0, borderColor: `${slide.secondary}33` }]}>
          <Sparkles color={slide.secondary} size={14} strokeWidth={2.5} />
          <View>
            <Text style={styles.miniLabel}>GEMINI</Text>
            <Text style={[styles.miniValue, { color: slide.secondary }]}>Bullish</Text>
          </View>
        </View>
      </View>
    );
  }
  if (slide.visual === "social") {
    return (
      <View style={styles.artBackdrop} pointerEvents="none">
        <View style={[styles.miniCard, { top: 4, left: -4, borderColor: `${slide.primary}33` }]}>
          <Mic color={slide.primary} size={14} strokeWidth={2.5} />
          <View>
            <Text style={styles.miniLabel}>LOBBY</Text>
            <Text style={[styles.miniValue, { color: slide.primary }]}>14 live</Text>
          </View>
        </View>
        <View style={[styles.miniCard, { bottom: 6, right: -4, borderColor: `${slide.secondary}33` }]}>
          <BarChart3 color={slide.secondary} size={14} strokeWidth={2.5} />
          <View>
            <Text style={styles.miniLabel}>CHARTS</Text>
            <Text style={[styles.miniValue, { color: slide.secondary }]}>Shared</Text>
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.artBackdrop} pointerEvents="none">
      <View style={[styles.miniCard, { top: 4, right: -4, borderColor: `${slide.primary}33` }]}>
        <Flame color={slide.primary} size={14} strokeWidth={2.5} />
        <View>
          <Text style={styles.miniLabel}>NEW</Text>
          <Text style={[styles.miniValue, { color: slide.primary }]}>+218%</Text>
        </View>
      </View>
      <View style={[styles.miniCard, { bottom: 8, left: -4, borderColor: `${slide.secondary}33` }]}>
        <Target color={slide.secondary} size={14} strokeWidth={2.5} />
        <View>
          <Text style={styles.miniLabel}>SNIPE</Text>
          <Text style={[styles.miniValue, { color: slide.secondary }]}>Armed</Text>
        </View>
      </View>
    </View>
  );
}

function LogoMark({
  primary,
  secondary,
  large = false,
}: {
  primary: string;
  secondary: string;
  large?: boolean;
}) {
  return (
    <View style={[styles.logoOuter, large ? styles.logoOuterLarge : styles.logoOuterCompact]} testID="soltools-logo">
      <LinearGradient
        colors={[primary, secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.logoGradient, large ? styles.logoGradientLarge : styles.logoGradientCompact]}
      >
        <ScanLine color={Colors.ink} size={large ? 38 : 20} strokeWidth={3} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  background: { flex: 1 },
  safeArea: { flex: 1 },
  content: { flex: 1 },

  orb: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
  },
  orbOne: { top: -110, right: -120 },
  orbTwo: { bottom: 60, left: -140 },

  topBar: {
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2.4,
  },
  brandTagRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  brandTag: {
    color: Colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  skipText: {
    color: Colors.muted,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  pager: { flex: 1 },

  slide: {
    width: WINDOW_WIDTH,
    flex: 1,
  },
  slideInner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: "center",
  },

  heroWrap: {
    width: 280,
    height: 280,
    marginTop: 24,
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  heroGlow: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  heroRingOuter: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 1,
  },
  heroRingInner: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
  },
  heroIconCircle: {
    width: 124,
    height: 124,
    borderRadius: 36,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "rgba(3, 7, 8, 0.6)",
    ...(Platform.OS === "web" ? { boxShadow: "0 20px 50px rgba(0,0,0,0.45)" } : {}),
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 14,
  },
  heroIconGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  artBackdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  miniCard: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(7, 17, 19, 0.92)",
    borderWidth: 1,
  },
  miniDot: { width: 8, height: 8, borderRadius: 4 },
  miniLabel: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  miniValue: {
    fontSize: 13,
    fontWeight: "900",
    marginTop: 2,
  },

  copyWrap: {
    width: "100%",
    paddingHorizontal: 4,
    marginTop: 8,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  title: {
    color: Colors.text,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: "900",
    letterSpacing: -1.4,
  },
  body: {
    color: Colors.muted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    marginTop: 12,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 18,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  chipText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  bottomDock: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 22,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  dotActive: {
    height: 8,
  },
  ctaButton: {
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  ctaGradient: {
    minHeight: 60,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  ctaText: {
    color: Colors.ink,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  footerHint: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textAlign: "center",
    marginTop: 12,
    textTransform: "uppercase",
  },

  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.ink,
  },
  splashGlow: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(85, 245, 178, 0.28)",
  },
  splashLogoWrap: { alignItems: "center" },
  splashTitle: {
    color: Colors.text,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: 4,
    marginTop: 22,
  },
  splashSubtitle: {
    color: Colors.mint,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2.4,
    marginTop: 8,
  },

  logoOuter: {
    padding: 2,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
  },
  logoOuterCompact: { width: 44, height: 44, borderRadius: 14 },
  logoOuterLarge: { width: 108, height: 108, borderRadius: 32 },
  logoGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoGradientCompact: { borderRadius: 12 },
  logoGradientLarge: { borderRadius: 28 },
});
