import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import {
  AtSign,
  Camera,
  CheckCircle2,
  ChevronDown,
  Globe2,
  ImagePlus,
  Link2,
  Loader2,
  MessageCircle,
  Rocket,
  Send,
  Tag,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { navigateBack } from "@/lib/navigation";
import { useTokenAutolink } from "@/lib/use-token-autolink";
import { useLaunchpad } from "@/providers/launchpad-provider";
import { LaunchVenue } from "@/types/launchpad";
import { SOLTOOLS_DEFAULT_BANNER } from "@/utils/token-art";

const VENUES: { key: LaunchVenue; label: string }[] = [
  { key: "pumpfun", label: "pump.fun" },
  { key: "pumpswap", label: "pumpswap" },
  { key: "raydium", label: "raydium" },
  { key: "meteora", label: "meteora" },
  { key: "jupiter", label: "jupiter" },
  { key: "moonshot", label: "moonshot" },
  { key: "fomo", label: "fomo" },
  { key: "other", label: "other" },
];

export default function ListTokenScreen() {
  const router = useRouter();
  const { submit, isSubmitting } = useLaunchpad();

  const [name, setName] = useState<string>("");
  const [ticker, setTicker] = useState<string>("");
  const [contract, setContract] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [venue, setVenue] = useState<LaunchVenue>("pumpfun");
  const [website, setWebsite] = useState<string>("");
  const [twitter, setTwitter] = useState<string>("");
  const [telegram, setTelegram] = useState<string>("");
  const [discord, setDiscord] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>("");
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [bannerUri, setBannerUri] = useState<string | null>(null);
  const [boost, setBoost] = useState<boolean>(false);
  const [agree, setAgree] = useState<boolean>(false);

  const [venueOpen, setVenueOpen] = useState<boolean>(false);

  const canSubmit = useMemo(() => {
    return (
      name.trim().length >= 2 &&
      ticker.trim().length >= 1 &&
      contract.trim().length >= 8 &&
      agree &&
      !isSubmitting
    );
  }, [name, ticker, contract, agree, isSubmitting]);

  const onPickLogo = useCallback(async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!res.canceled && res.assets[0]?.uri) {
        setLogoUri(res.assets[0].uri);
      }
    } catch (e) {
      console.log("[list-token] logo pick failed", e);
    }
  }, []);

  const onPickBanner = useCallback(async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: true,
        aspect: [16, 9],
      });
      if (!res.canceled && res.assets[0]?.uri) {
        setBannerUri(res.assets[0].uri);
      }
    } catch (e) {
      console.log("[list-token] banner pick failed", e);
    }
  }, []);

  const addTag = useCallback(() => {
    const t = tagInput.trim().replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (!t || tags.includes(t) || tags.length >= 6) return;
    setTags((prev) => [...prev, t]);
    setTagInput("");
  }, [tagInput, tags]);

  const removeTag = useCallback((t: string) => {
    setTags((prev) => prev.filter((x) => x !== t));
  }, []);

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    try {
      await submit({
        name: name.trim(),
        ticker: ticker.trim().replace("$", "").toUpperCase(),
        contract: contract.trim(),
        description: description.trim(),
        venue,
        status: "pending",
        logoUrl: logoUri,
        bannerUrl: bannerUri,
        website: website.trim() || undefined,
        twitter: twitter.trim() || undefined,
        telegram: telegram.trim() || undefined,
        discord: discord.trim() || undefined,
        tags,
        featured: boost,
        price: null,
        change24hPct: null,
        liquidityUsd: null,
        marketCapUsd: null,
        volume24hUsd: null,
        holders: null,
      });
      Alert.alert("Submitted for review", "Your token was sent to the Discover featured queue. It will appear after admin approval.");
      navigateBack(router, "/(tabs)/discover");
    } catch (e) {
      console.log("[list-token] submit failed", e);
      Alert.alert("Submission failed", "Please try again in a moment.");
    }
  }, [
    canSubmit,
    submit,
    name,
    ticker,
    contract,
    description,
    venue,
    logoUri,
    bannerUri,
    website,
    twitter,
    telegram,
    discord,
    tags,
    boost,
    router,
  ]);

  const venueLabel = useMemo(() => VENUES.find((v) => v.key === venue)?.label ?? "Select", [venue]);

  const autolink = useTokenAutolink({
    ticker,
    contract,
    onResolve: useCallback((data, via) => {
      if (via === "ca") {
        if (!ticker.trim() && data.ticker) setTicker(data.ticker);
        if (!name.trim() && data.name) setName(data.name);
        if (!logoUri && data.logoUrl) setLogoUri(data.logoUrl);
      } else {
        if (data.address && !contract.trim()) setContract(data.address);
        if (!name.trim() && data.name) setName(data.name);
        if (!logoUri && data.logoUrl) setLogoUri(data.logoUrl);
      }
    }, [ticker, name, logoUri, contract]),
  });

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, presentation: "modal" }} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={() => navigateBack(router, "/(tabs)/discover")} style={styles.closeBtn} hitSlop={10} testID="close-list">
            <X color={Colors.text} size={18} strokeWidth={2.6} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>List Your Token</Text>
            <Text style={styles.headerSub}>Get discovered by $OGS traders</Text>
          </View>
          <View style={styles.closeBtn} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Pressable onPress={onPickBanner} style={styles.bannerWrap} testID="pick-banner">
              <Image
                source={{ uri: bannerUri ?? SOLTOOLS_DEFAULT_BANNER }}
                style={styles.bannerImg}
                contentFit="cover"
              />
              <LinearGradient
                colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.42)"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.bannerCameraChip}>
                <Camera color={Colors.text} size={16} strokeWidth={2.5} />
              </View>
              <Pressable
                onPress={onPickLogo}
                style={styles.logoFloat}
                testID="pick-logo"
                hitSlop={6}
              >
                {logoUri ? (
                  <Image source={{ uri: logoUri }} style={styles.logoImg} contentFit="cover" />
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <ImagePlus color={Colors.text} size={18} strokeWidth={2.4} />
                  </View>
                )}
                <View style={styles.logoEdit}>
                  <Camera color={Colors.ink} size={11} strokeWidth={3} />
                </View>
              </Pressable>
            </Pressable>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Project basics</Text>

              <Field label="Project name" required>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="The Official Unc Coin"
                  placeholderTextColor={Colors.muted}
                  style={styles.input}
                  testID="input-name"
                />
              </Field>

              <View style={styles.row}>
                <View style={styles.rowChild}>
                  <Field label="Ticker" required>
                    <View style={styles.inputWithPrefix}>
                      <Text style={styles.prefix}>$</Text>
                      <TextInput
                        value={ticker}
                        onChangeText={(t) => setTicker(t.replace("$", "").toUpperCase())}
                        placeholder="UNC67"
                        placeholderTextColor={Colors.muted}
                        autoCapitalize="characters"
                        style={[styles.input, styles.inputPrefixed]}
                        maxLength={12}
                        testID="input-ticker"
                      />
                    </View>
                  </Field>
                </View>
                <View style={styles.rowChild}>
                  <Field label="Review state">
                    <View style={styles.select} testID="review-state">
                      <Text style={styles.selectText}>Admin approval required</Text>
                    </View>
                  </Field>
                </View>
              </View>

              <Field label="Contract address" required>
                <TextInput
                  value={contract}
                  onChangeText={setContract}
                  placeholder="So11111111111111111111111111111111111111112"
                  placeholderTextColor={Colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  testID="input-contract"
                />
                <AutolinkStatus state={autolink} />
              </Field>

              <Field label="Venue">
                <Pressable onPress={() => setVenueOpen(true)} style={styles.select} testID="open-venue">
                  <Text style={styles.selectText}>{venueLabel}</Text>
                  <ChevronDown color={Colors.muted} size={14} strokeWidth={2.4} />
                </Pressable>
              </Field>

              <Field label="Description">
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Tell traders what makes your project unique..."
                  placeholderTextColor={Colors.muted}
                  multiline
                  numberOfLines={4}
                  style={[styles.input, styles.textarea]}
                  maxLength={400}
                  testID="input-description"
                />
                <Text style={styles.counter}>{description.length}/400</Text>
              </Field>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Links</Text>
              <Field label="Website" Icon={Globe2}>
                <TextInput
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="https://yourproject.xyz"
                  placeholderTextColor={Colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={styles.input}
                  testID="input-website"
                />
              </Field>
              <Field label="Twitter / X" Icon={AtSign}>
                <TextInput
                  value={twitter}
                  onChangeText={setTwitter}
                  placeholder="@yourproject"
                  placeholderTextColor={Colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  testID="input-twitter"
                />
              </Field>
              <View style={styles.row}>
                <View style={styles.rowChild}>
                  <Field label="Telegram" Icon={Send}>
                    <TextInput
                      value={telegram}
                      onChangeText={setTelegram}
                      placeholder="t.me/group"
                      placeholderTextColor={Colors.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.input}
                      testID="input-telegram"
                    />
                  </Field>
                </View>
                <View style={styles.rowChild}>
                  <Field label="Discord" Icon={MessageCircle}>
                    <TextInput
                      value={discord}
                      onChangeText={setDiscord}
                      placeholder="discord.gg/..."
                      placeholderTextColor={Colors.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.input}
                      testID="input-discord"
                    />
                  </Field>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Tags</Text>
              <View style={styles.tagInputRow}>
                <Tag color={Colors.muted} size={14} strokeWidth={2.4} />
                <TextInput
                  value={tagInput}
                  onChangeText={setTagInput}
                  placeholder="meme, ai, defi..."
                  placeholderTextColor={Colors.muted}
                  onSubmitEditing={addTag}
                  returnKeyType="done"
                  style={styles.tagInput}
                  autoCapitalize="none"
                  testID="input-tag"
                />
                <Pressable
                  onPress={addTag}
                  style={[styles.tagAddBtn, !tagInput.trim() && styles.tagAddBtnDisabled]}
                  testID="add-tag"
                  disabled={!tagInput.trim()}
                >
                  <Text style={styles.tagAddText}>Add</Text>
                </Pressable>
              </View>
              {tags.length > 0 ? (
                <View style={styles.tagsRow}>
                  {tags.map((t) => (
                    <Pressable key={t} onPress={() => removeTag(t)} style={styles.tagChip} testID={`tag-${t}`}>
                      <Text style={styles.tagChipText}>#{t}</Text>
                      <X color={Colors.mint} size={11} strokeWidth={2.6} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.helper}>Up to 6 tags. Helps users discover your project.</Text>
              )}
            </View>

            <View style={styles.section}>
              <Pressable onPress={() => setBoost((v) => !v)} style={styles.toggleRow} testID="toggle-boost">
                <View style={styles.toggleLeft}>
                  <View style={[styles.toggleIcon, { backgroundColor: "rgba(255,184,76,0.14)" }]}>
                    <Rocket color={Colors.orange} size={14} strokeWidth={2.6} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleTitle}>Request Featured placement</Text>
                    <Text style={styles.toggleBody}>
                      Ask admin to pin this token to the Discover Featured rail after review.
                    </Text>
                  </View>
                </View>
                <View style={[styles.switchTrack, boost && styles.switchTrackOn]}>
                  <View style={[styles.switchThumb, boost && styles.switchThumbOn]} />
                </View>
              </Pressable>

              <Pressable onPress={() => setAgree((v) => !v)} style={styles.checkRow} testID="toggle-agree">
                <View style={[styles.checkbox, agree && styles.checkboxOn]}>
                  {agree ? <CheckCircle2 color={Colors.ink} size={14} strokeWidth={3} /> : null}
                </View>
                <Text style={styles.checkText}>
                  I confirm I have authority to list this token and the information provided is accurate.
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={onSubmit}
              disabled={!canSubmit}
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              testID="submit-listing"
            >
              <LinearGradient
                colors={canSubmit ? [Colors.mint, Colors.cyan] : ["#1a2528", "#1a2528"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.submitGradient}
              >
                {isSubmitting ? (
                  <Loader2 color={Colors.ink} size={18} strokeWidth={3} />
                ) : (
                  <Rocket color={canSubmit ? Colors.ink : Colors.muted} size={16} strokeWidth={3} />
                )}
                <Text style={[styles.submitText, !canSubmit && { color: Colors.muted }]}>
                  {isSubmitting ? "Submitting..." : "Submit listing"}
                </Text>
              </LinearGradient>
            </Pressable>

            <Text style={styles.legalText}>
              Submissions are reviewed by the $OGS team. Verified listings receive a community badge.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <PickerModal
        visible={venueOpen}
        title="Select venue"
        onClose={() => setVenueOpen(false)}
        options={VENUES}
        selected={venue}
        onSelect={(k) => {
          setVenue(k);
          setVenueOpen(false);
        }}
      />
    </View>
  );
}

function AutolinkStatus({ state }: { state: ReturnType<typeof useTokenAutolink> }) {
  if (state.status === "idle") return null;
  if (state.status === "resolving") {
    return (
      <View style={styles.linkRow}>
        <Loader2 color={Colors.cyan} size={11} strokeWidth={2.6} />
        <Text style={styles.linkText}>{state.via === "ca" ? "Resolving ticker from chain\u2026" : "Searching CA on Solana\u2026"}</Text>
      </View>
    );
  }
  if (state.status === "missing") {
    return (
      <View style={styles.linkRow}>
        <Link2 color={Colors.muted} size={11} strokeWidth={2.6} />
        <Text style={[styles.linkText, { color: Colors.muted }]}>{state.via === "ca" ? "No metadata found for this CA yet" : "No live token matches that ticker"}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.linkRow, styles.linkRowOk]}>
      <CheckCircle2 color={Colors.mint} size={11} strokeWidth={2.6} />
      <Text style={[styles.linkText, { color: Colors.mint }]}>
        {state.via === "ca" ? `Linked ${state.data.ticker} from chain` : `Linked CA \u2022 ${state.data.address.slice(0, 4)}\u2026${state.data.address.slice(-4)}`}
      </Text>
    </View>
  );
}

function Field({
  label,
  required,
  Icon,
  children,
}: {
  label: string;
  required?: boolean;
  Icon?: typeof Globe2;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        {Icon ? <Icon color={Colors.muted} size={12} strokeWidth={2.6} /> : null}
        <Text style={styles.fieldLabel}>{label}</Text>
        {required ? <Text style={styles.requiredDot}>*</Text> : null}
      </View>
      {children}
    </View>
  );
}

function PickerModal<K extends string>({
  visible,
  title,
  onClose,
  options,
  selected,
  onSelect,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  options: { key: K; label: string }[];
  selected: K;
  onSelect: (key: K) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          {options.map((o) => {
            const active = o.key === selected;
            return (
              <Pressable
                key={o.key}
                onPress={() => onSelect(o.key)}
                style={[styles.sheetRow, active && styles.sheetRowActive]}
                testID={`opt-${o.key}`}
              >
                <Text style={[styles.sheetRowText, active && styles.sheetRowTextActive]}>{o.label}</Text>
                {active ? <CheckCircle2 color={Colors.mint} size={16} strokeWidth={2.4} /> : null}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.2 },
  headerSub: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 64 },

  bannerWrap: {
    height: 160,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.18)",
    marginBottom: 36,
  },
  bannerImg: { ...StyleSheet.absoluteFillObject },
  bannerCameraChip: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.56)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  logoFloat: {
    position: "absolute",
    bottom: -28,
    left: 16,
    width: 64,
    height: 64,
    borderRadius: 18,
    overflow: "visible",
  },
  logoImg: { width: 64, height: 64, borderRadius: 18, borderWidth: 3, borderColor: Colors.ink },
  logoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: Colors.cardSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: Colors.ink,
  },
  logoEdit: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.mint,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.ink,
  },

  section: { marginTop: 20 },
  sectionLabel: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  field: { marginBottom: 12 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 },
  fieldLabel: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  requiredDot: { color: Colors.rose, fontSize: 12, fontWeight: "900" },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 13 : 10,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  inputWithPrefix: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingLeft: 14,
  },
  prefix: { color: Colors.mint, fontSize: 14, fontWeight: "900" },
  inputPrefixed: { flex: 1, backgroundColor: "transparent", borderWidth: 0, paddingLeft: 4 },
  textarea: { height: 100, textAlignVertical: "top", paddingTop: 12 },
  counter: { color: Colors.muted, fontSize: 10, fontWeight: "700", textAlign: "right", marginTop: 4 },
  row: { flexDirection: "row", gap: 10 },
  rowChild: { flex: 1 },
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  selectText: { color: Colors.text, fontSize: 14, fontWeight: "700" },

  tagInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 6 : 2,
  },
  tagInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: 8,
  },
  tagAddBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: "rgba(85,245,178,0.16)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.4)",
  },
  tagAddBtnDisabled: { opacity: 0.4 },
  tagAddText: { color: Colors.mint, fontSize: 12, fontWeight: "900" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(85,245,178,0.1)",
    borderWidth: 1,
    borderColor: "rgba(85,245,178,0.3)",
  },
  tagChipText: { color: Colors.mint, fontSize: 11, fontWeight: "900" },
  helper: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 8 },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  toggleLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, paddingRight: 12 },
  toggleIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  toggleTitle: { color: Colors.text, fontSize: 13, fontWeight: "900" },
  toggleBody: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  switchTrack: {
    width: 42,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 2,
    justifyContent: "center",
  },
  switchTrackOn: { backgroundColor: Colors.mint },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.muted },
  switchThumbOn: { backgroundColor: Colors.ink, transform: [{ translateX: 18 }] },

  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  checkText: { flex: 1, color: Colors.text, fontSize: 12, fontWeight: "600", lineHeight: 17 },

  submitBtn: { marginTop: 22, borderRadius: 14, overflow: "hidden" },
  submitBtnDisabled: { opacity: 0.6 },
  submitGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  submitText: { color: Colors.ink, fontSize: 14, fontWeight: "900", letterSpacing: 0.3 },
  legalText: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
    textAlign: "center",
    marginTop: 14,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: "rgba(56,215,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(56,215,255,0.18)",
    alignSelf: "flex-start",
  },
  linkRowOk: {
    backgroundColor: "rgba(85,245,178,0.10)",
    borderColor: "rgba(85,245,178,0.28)",
  },
  linkText: { color: Colors.cyan, fontSize: 10.5, fontWeight: "800" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 14,
  },
  sheetTitle: { color: Colors.text, fontSize: 16, fontWeight: "900", marginBottom: 8 },
  sheetRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetRowActive: { backgroundColor: "rgba(85,245,178,0.1)" },
  sheetRowText: { color: Colors.muted, fontSize: 14, fontWeight: "700" },
  sheetRowTextActive: { color: Colors.mint, fontWeight: "900" },
});
