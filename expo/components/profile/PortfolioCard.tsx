import { LinearGradient } from "expo-linear-gradient";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from "react-native-svg";

import Colors from "@/constants/colors";
import { useApp } from "@/providers/app-provider";
import { useLaunchpad } from "@/providers/launchpad-provider";

type Range = "1D" | "1W" | "1M" | "3M" | "ALL";

const RANGES: Range[] = ["1D", "1W", "1M", "3M", "ALL"];

function genSparkline(seed: number, points: number, drift: number): number[] {
  const out: number[] = [];
  let v = 50;
  let s = seed;
  for (let i = 0; i < points; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = (s / 233280) - 0.5;
    v += r * 6 + drift;
    out.push(Math.max(5, Math.min(100, v)));
  }
  return out;
}

function buildPath(values: number[], width: number, height: number): { line: string; area: string } {
  if (values.length < 2) return { line: "", area: "" };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.001, max - min);
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return [x, y];
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  return { line, area };
}

export default function PortfolioCard() {
  const { watchlist, wallets } = useApp();
  const { listings } = useLaunchpad();
  const [range, setRange] = useState<Range>("1W");
  const [hidden, setHidden] = useState<boolean>(false);

  const stats = useMemo(() => {
    const seed = (watchlist.length + 1) * 17 + (wallets.length + 1) * 11 + listings.length;
    const drift = range === "1D" ? 0.05 : range === "1W" ? 0.15 : range === "1M" ? 0.3 : range === "3M" ? 0.4 : 0.6;
    const points = range === "1D" ? 24 : range === "1W" ? 32 : range === "1M" ? 30 : range === "3M" ? 36 : 48;
    const series = genSparkline(seed, points, drift);
    const start = series[0] ?? 50;
    const end = series[series.length - 1] ?? 50;
    const balance = 4280 + (seed % 8400) + watchlist.length * 38 + wallets.length * 120;
    const change = ((end - start) / Math.max(1, start)) * 100;
    return { series, balance, change, drift };
  }, [watchlist.length, wallets.length, listings.length, range]);

  const positive = stats.change >= 0;
  const accent = positive ? Colors.mint : Colors.rose;
  const stroke = positive ? Colors.mint : Colors.rose;

  const W = 280;
  const H = 80;
  const path = useMemo(() => buildPath(stats.series, W, H), [stats.series]);

  const balanceText = hidden ? "•••••••" : `$${stats.balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const changeText = `${positive ? "+" : ""}${stats.change.toFixed(2)}%`;
  const changeUsd = `${positive ? "+" : "-"}$${Math.abs((stats.balance * stats.change) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const allocations = useMemo(
    () => [
      { label: "SOL", color: Colors.mint, pct: 38 },
      { label: "JUP", color: Colors.cyan, pct: 22 },
      { label: "BONK", color: Colors.orange, pct: 18 },
      { label: "OTHER", color: Colors.violet, pct: 22 },
    ],
    [],
  );

  return (
    <View style={styles.wrap} testID="portfolio-card">
      <LinearGradient
        colors={[`${accent}1A`, "rgba(0,0,0,0)", `${accent}10`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bgGrad}
      />

      <View style={styles.head}>
        <View style={styles.headLeft}>
          <View style={[styles.iconBox, { backgroundColor: `${accent}1F` }]}>
            <Wallet color={accent} size={14} strokeWidth={2.6} />
          </View>
          <View>
            <Text style={styles.eyebrow}>PORTFOLIO P&L</Text>
            <Text style={styles.balance}>{balanceText}</Text>
          </View>
        </View>
        <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8} style={styles.eyeBtn}>
          {hidden ? (
            <EyeOff color={Colors.muted} size={14} strokeWidth={2.6} />
          ) : (
            <Eye color={Colors.muted} size={14} strokeWidth={2.6} />
          )}
        </Pressable>
      </View>

      <View style={styles.changeRow}>
        <View style={[styles.changePill, { borderColor: `${accent}66`, backgroundColor: `${accent}1A` }]}>
          {positive ? (
            <TrendingUp color={accent} size={12} strokeWidth={3} />
          ) : (
            <TrendingDown color={accent} size={12} strokeWidth={3} />
          )}
          <Text style={[styles.changeText, { color: accent }]}>{changeText}</Text>
        </View>
        <Text style={[styles.changeUsd, { color: accent }]}>{changeUsd}</Text>
        <Text style={styles.changeSub}>· {range}</Text>
      </View>

      <View style={styles.chartWrap}>
        <Svg width={W} height={H} style={{ alignSelf: "stretch" }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <Defs>
            <SvgLinearGradient id="pf-area" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity="0.45" />
              <Stop offset="1" stopColor={stroke} stopOpacity="0" />
            </SvgLinearGradient>
          </Defs>
          {path.area ? <Path d={path.area} fill="url(#pf-area)" /> : null}
          {path.line ? (
            <Path d={path.line} stroke={stroke} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ) : null}
        </Svg>
      </View>

      <View style={styles.rangesRow}>
        {RANGES.map((r) => {
          const active = r === range;
          return (
            <Pressable
              key={r}
              onPress={() => setRange(r)}
              style={[styles.rangeChip, active && { backgroundColor: `${accent}26` }]}
              testID={`pf-range-${r}`}
            >
              <Text style={[styles.rangeText, active && { color: accent }]}>{r}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.allocWrap}>
        <View style={styles.allocBar}>
          {allocations.map((a, i) => (
            <View
              key={a.label}
              style={{
                width: `${a.pct}%`,
                backgroundColor: a.color,
                height: "100%",
                borderTopLeftRadius: i === 0 ? 6 : 0,
                borderBottomLeftRadius: i === 0 ? 6 : 0,
                borderTopRightRadius: i === allocations.length - 1 ? 6 : 0,
                borderBottomRightRadius: i === allocations.length - 1 ? 6 : 0,
              }}
            />
          ))}
        </View>
        <View style={styles.allocLegend}>
          {allocations.map((a) => (
            <View key={a.label} style={styles.allocItem}>
              <View style={[styles.allocDot, { backgroundColor: a.color }]} />
              <Text style={styles.allocLabel}>{a.label}</Text>
              <Text style={styles.allocPct}>{a.pct}%</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatCell label="BEST" value="+38.2%" Icon={ArrowUpRight} color={Colors.mint} />
        <StatCell label="WORST" value="-12.4%" Icon={ArrowDownRight} color={Colors.rose} />
        <StatCell label="TRADES" value="142" Icon={Activity} color={Colors.cyan} />
        <StatCell label="ALPHA" value="A+" Icon={Sparkles} color={Colors.violet} />
      </View>
    </View>
  );
}

function StatCell({
  label,
  value,
  Icon,
  color,
}: {
  label: string;
  value: string;
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  color: string;
}) {
  return (
    <View style={[styles.statCell, { borderColor: `${color}33` }]}>
      <Icon color={color} size={11} strokeWidth={3} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 14,
    marginTop: 12,
    padding: 16,
    borderRadius: 24,
    backgroundColor: "rgba(11,18,24,0.85)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.18)",
    overflow: "hidden",
    shadowColor: Colors.mint,
    shadowOpacity: 0.25,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  bgGrad: {
    ...StyleSheet.absoluteFillObject,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: Colors.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  balance: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.7,
    marginTop: 2,
  },
  eyeBtn: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  changeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  changeText: { fontSize: 12, fontWeight: "900" },
  changeUsd: { fontSize: 13, fontWeight: "900" },
  changeSub: { color: Colors.muted, fontSize: 12, fontWeight: "700" },
  chartWrap: {
    marginTop: 12,
    height: 80,
    overflow: "hidden",
  },
  rangesRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    padding: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  rangeChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 9,
    alignItems: "center",
  },
  rangeText: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  allocWrap: { marginTop: 14, gap: 8 },
  allocBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  allocLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  allocItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  allocDot: { width: 8, height: 8, borderRadius: 4 },
  allocLabel: { color: Colors.text, fontSize: 11, fontWeight: "800" },
  allocPct: { color: Colors.muted, fontSize: 10, fontWeight: "700" },
  statsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 14,
  },
  statCell: {
    flex: 1,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-start",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  statValue: { fontSize: 13, fontWeight: "900", letterSpacing: -0.2 },
  statLabel: {
    color: Colors.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
});
