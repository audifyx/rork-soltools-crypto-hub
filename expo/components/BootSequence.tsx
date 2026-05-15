import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const SPLASH_DURATION_MS = 5200;

type Props = {
  onDone?: () => void;
  caption?: string;
};

type GridLine = {
  key: string;
  vertical: boolean;
  position: number;
};

/** App boot splash matching the Sol Tools branded launch animation. */
export default function BootSequence({ onDone, caption = "SOL TOOLS" }: Props) {
  const [isExiting, setIsExiting] = useState<boolean>(false);
  const completedRef = useRef<boolean>(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const splashOpacity = useRef<Animated.Value>(new Animated.Value(1)).current;
  const splashScale = useRef<Animated.Value>(new Animated.Value(1)).current;
  const gridShift = useRef<Animated.Value>(new Animated.Value(0)).current;
  const logoScale = useRef<Animated.Value>(new Animated.Value(0.1)).current;
  const logoOpacity = useRef<Animated.Value>(new Animated.Value(0)).current;
  const logoRotate = useRef<Animated.Value>(new Animated.Value(0)).current;
  const logoPulse = useRef<Animated.Value>(new Animated.Value(0)).current;
  const orbFloat = useRef<Animated.Value>(new Animated.Value(0)).current;
  const titleOpacity = useRef<Animated.Value>(new Animated.Value(0)).current;
  const subtitleOpacity = useRef<Animated.Value>(new Animated.Value(0)).current;
  const welcomeOpacity = useRef<Animated.Value>(new Animated.Value(0)).current;
  const welcomeRise = useRef<Animated.Value>(new Animated.Value(12)).current;

  const gridLines = useMemo<GridLine[]>(() => makeGridLines(SCREEN_W, SCREEN_H), []);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onDone?.();
  }, [onDone]);

  const startExit = useCallback(() => {
    if (isExiting || completedRef.current) return;
    setIsExiting(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    Animated.parallel([
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: 800,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(splashScale, {
        toValue: 0.9,
        duration: 800,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) finish();
    });
  }, [finish, isExiting, splashOpacity, splashScale]);

  useEffect(() => {
    Animated.loop(
      Animated.timing(gridShift, {
        toValue: 1,
        duration: 40000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(orbFloat, {
          toValue: 1,
          duration: 14000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(orbFloat, {
          toValue: 0,
          duration: 14000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 5,
          tension: 68,
          useNativeDriver: true,
        }),
        Animated.timing(logoRotate, {
          toValue: 1,
          duration: 1800,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(360),
          Animated.timing(subtitleOpacity, {
            toValue: 1,
            duration: 900,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(860),
          Animated.parallel([
            Animated.timing(welcomeOpacity, {
              toValue: 1,
              duration: 900,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(welcomeRise, {
              toValue: 0,
              duration: 900,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(logoPulse, {
          toValue: 1,
          duration: 2500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(logoPulse, {
          toValue: 0,
          duration: 2500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();

    timeoutRef.current = setTimeout(startExit, SPLASH_DURATION_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [gridShift, logoOpacity, logoPulse, logoRotate, logoScale, orbFloat, startExit, subtitleOpacity, titleOpacity, welcomeOpacity, welcomeRise]);

  const gridTranslate = gridShift.interpolate({ inputRange: [0, 1], outputRange: [0, 80] });
  const logoSpin = logoRotate.interpolate({ inputRange: [0, 1], outputRange: ["-30deg", "0deg"] });
  const logoGlowScale = logoPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const logoGlowOpacity = logoPulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.86] });
  const orbTranslateX = orbFloat.interpolate({ inputRange: [0, 1], outputRange: [0, 130] });
  const orbTranslateY = orbFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -100] });
  const orbScale = orbFloat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.root,
        { opacity: splashOpacity, transform: [{ scale: splashScale }] },
      ]}
      testID="boot-sequence"
    >
      <Pressable onPress={startExit} style={StyleSheet.absoluteFill} testID="boot-sequence-skip">
        <LinearGradient
          colors={["#0A1428", "#02050F", "#000000"]}
          locations={[0, 0.6, 0.95]}
          start={{ x: 0.5, y: 0.32 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[
              styles.gridLayer,
              { transform: [{ translateX: gridTranslate }, { translateY: gridTranslate }] },
            ]}
          >
            {gridLines.map((line) => (
              <View
                key={line.key}
                style={[
                  styles.gridLine,
                  line.vertical
                    ? { left: line.position, width: StyleSheet.hairlineWidth, height: SCREEN_H + 160 }
                    : { top: line.position, height: StyleSheet.hairlineWidth, width: SCREEN_W + 160 },
                ]}
              />
            ))}
          </Animated.View>

          <Animated.View
            style={[
              styles.orbOne,
              { transform: [{ translateX: orbTranslateX }, { translateY: orbTranslateY }, { scale: orbScale }] },
            ]}
          />
          <Animated.View
            style={[
              styles.orbTwo,
              { transform: [{ translateX: Animated.multiply(orbTranslateX, -0.55) }, { translateY: Animated.multiply(orbTranslateY, -0.35) }, { scale: orbScale }] },
            ]}
          />
          <View style={styles.centerRadialGlow} />
        </View>

        <View pointerEvents="none" style={styles.splashContent}>
          <Animated.View
            style={[
              styles.logoStage,
              { opacity: logoOpacity, transform: [{ scale: logoScale }, { rotate: logoSpin }] },
            ]}
          >
            <Animated.View
              style={[
                styles.logoGlow,
                { opacity: logoGlowOpacity, transform: [{ scale: logoGlowScale }] },
              ]}
            />
            <SolanaLogo size={Math.min(SCREEN_W * 0.78, 320)} />
          </Animated.View>

          <Animated.Text style={[styles.title, { opacity: titleOpacity }]}>{caption}</Animated.Text>
          <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>The ultimate Solana toolkit</Animated.Text>
          <Animated.Text
            style={[
              styles.welcome,
              { opacity: welcomeOpacity, transform: [{ translateY: welcomeRise }] },
            ]}
          >
            Welcome
          </Animated.Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function SolanaLogo({ size }: { size: number }) {
  const height = size * (398.17 / 508.07);

  return (
    <Svg width={size} height={height} viewBox="0 0 508.07 398.17" fill="none">
      <Defs>
        <SvgGradient
          id="soltools-splash-grad1"
          x1="463"
          y1="205.16"
          x2="182.39"
          y2="742.62"
          gradientTransform="translate(0 -198)"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#60A5FA" />
          <Stop offset="1" stopColor="#3B82F6" />
        </SvgGradient>
        <SvgGradient
          id="soltools-splash-grad2"
          x1="340.31"
          y1="141.1"
          x2="59.71"
          y2="678.57"
          gradientTransform="translate(0 -198)"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#93C5FD" />
          <Stop offset="1" stopColor="#3B82F6" />
        </SvgGradient>
        <SvgGradient
          id="soltools-splash-grad3"
          x1="401.26"
          y1="172.92"
          x2="120.66"
          y2="710.39"
          gradientTransform="translate(0 -198)"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#BAE6FD" />
          <Stop offset="1" stopColor="#60A5FA" />
        </SvgGradient>
      </Defs>
      <Path
        fill="url(#soltools-splash-grad1)"
        d="M84.53,358.89A16.63,16.63,0,0,1,96.28,354H501.73a8.3,8.3,0,0,1,5.87,14.18l-80.09,80.09a16.61,16.61,0,0,1-11.75,4.86H10.31A8.31,8.31,0,0,1,4.43,439Z"
        transform="translate(-1.98 -55)"
      />
      <Path
        fill="url(#soltools-splash-grad2)"
        d="M84.53,59.85A17.08,17.08,0,0,1,96.28,55H501.73a8.3,8.3,0,0,1,5.87,14.18l-80.09,80.09a16.61,16.61,0,0,1-11.75,4.86H10.31A8.31,8.31,0,0,1,4.43,140Z"
        transform="translate(-1.98 -55)"
      />
      <Path
        fill="url(#soltools-splash-grad3)"
        d="M427.51,208.42a16.61,16.61,0,0,0-11.75-4.86H10.31a8.31,8.31,0,0,0-5.88,14.18l80.1,80.09a16.6,16.6,0,0,0,11.75,4.86H501.73a8.3,8.3,0,0,0,5.87-14.18Z"
        transform="translate(-1.98 -55)"
      />
    </Svg>
  );
}

function makeGridLines(width: number, height: number): GridLine[] {
  const lines: GridLine[] = [];
  const spacing = 80;
  for (let x = -spacing; x <= width + spacing; x += spacing) {
    lines.push({ key: `v-${x}`, vertical: true, position: x });
  }
  for (let y = -spacing; y <= height + spacing; y += spacing) {
    lines.push({ key: `h-${y}`, vertical: false, position: y });
  }
  return lines;
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#000000",
    overflow: "hidden",
    zIndex: 100,
  },
  gridLayer: {
    position: "absolute",
    top: -80,
    left: -80,
    width: SCREEN_W + 160,
    height: SCREEN_H + 160,
  },
  gridLine: {
    position: "absolute",
    backgroundColor: "rgba(59,130,246,0.12)",
  },
  orbOne: {
    position: "absolute",
    width: 650,
    height: 650,
    borderRadius: 325,
    top: SCREEN_H * 0.05,
    left: -SCREEN_W * 0.55,
    backgroundColor: "rgba(147,197,253,0.18)",
  },
  orbTwo: {
    position: "absolute",
    width: 520,
    height: 520,
    borderRadius: 260,
    right: -SCREEN_W * 0.55,
    bottom: SCREEN_H * 0.08,
    backgroundColor: "rgba(59,130,246,0.16)",
  },
  centerRadialGlow: {
    position: "absolute",
    width: SCREEN_W * 1.25,
    height: SCREEN_W * 1.25,
    borderRadius: SCREEN_W,
    top: SCREEN_H * 0.18,
    left: -SCREEN_W * 0.125,
    backgroundColor: "rgba(10,20,40,0.72)",
  },
  splashContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  logoStage: {
    width: Math.min(SCREEN_W * 0.78, 320),
    minHeight: Math.min(SCREEN_W * 0.78, 320),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
  },
  logoGlow: {
    position: "absolute",
    width: Math.min(SCREEN_W * 0.86, 360),
    height: Math.min(SCREEN_W * 0.86, 360),
    borderRadius: 180,
    backgroundColor: "rgba(59,130,246,0.34)",
    shadowColor: "#3B82F6",
    shadowOpacity: 1,
    shadowRadius: 80,
    shadowOffset: { width: 0, height: 0 },
  },
  title: {
    color: "#F0F9FF",
    fontSize: Math.min(SCREEN_W * 0.145, 58),
    fontWeight: "900",
    letterSpacing: -3.5,
    textAlign: "center",
    textShadowColor: "rgba(59,130,246,0.85)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  subtitle: {
    color: "#BAE6FD",
    fontSize: Math.min(SCREEN_W * 0.052, 21),
    fontWeight: "600",
    marginTop: 8,
    textAlign: "center",
    textShadowColor: "rgba(59,130,246,0.45)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  welcome: {
    color: "#94A3B8",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 5,
    marginTop: 60,
    textAlign: "center",
    textTransform: "uppercase",
  },
});
