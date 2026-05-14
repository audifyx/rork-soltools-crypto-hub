import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Coins,
  Globe,
  Hash,
  KeyRound,
  Lock,
  Plus,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
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
import { SOLTOOLS_TOKEN_MINT } from "@/lib/badge-system";
import type { CommunityAccessType } from "@/lib/community-access";
import { navigateBack } from "@/lib/navigation";
import { uploadCommunityMedia } from "@/lib/upload";
import { useApp } from "@/providers/app-provider";
import { useCommunityAccess } from "@/providers/community-access-provider";
import { Community, useSocial } from "@/providers/social-provider";

type Step = 0 | 1 | 2 | 3;
type Category = Community["category"];

const STEPS: { id: Step; eyebrow: string; title: string; subtitle: string }[] = [
  { id: 0, eyebrow: "01 · Identity", title: "Name your tribe", subtitle: "Give it a name, a face, and a handle people can find." },
  { id: 1, eyebrow: "02 · Story", title: "Tell the story", subtitle: "A short hook and a vibe that fits your community." },
  { id: 2, eyebrow: "03 · Rules", title: "Set the rules", subtitle: "Tags, house rules, and who's allowed inside." },
  { id: 3, eyebrow: "04 · Launch", title: "Ready to launch?", subtitle: "Double-check everything looks right before going live." },
];

const CATEGORIES: { id: Category; label: string; emoji: string }[] = [
  { id: "memes", label: "Memes", emoji: "🐸" },
  { id: "ai", label: "AI", emoji: "🧠" },
  { id: "defi", label: "DeFi", emoji: "💱" },
  { id: "nft", label: "NFTs", emoji: "🎨" },
  { id: "gaming", label: "Gaming", emoji: "🎮" },
  { id: "infra", label: "Infra", emoji: "⚙️" },
  { id: "trading", label: "Trading", emoji: "📈" },
  { id: "alpha", label: "Alpha", emoji: "🔮" },
];

const PALETTES: { id: string; name: string; colors: [string, string] }[] = [
  { id: "azure", name: "Azure", colors: [Colors.mint, Colors.cyan] },
  { id: "twilight", name: "Twilight", colors: [Colors.cyan, Colors.violet] },
  { id: "iris", name: "Iris", colors: [Colors.violet, Colors.neon] },
  { id: "frost", name: "Frost", colors: [Colors.neon, Colors.cyan] },
  { id: "deep", name: "Deep", colors: ["#1E5BAA", "#3FA9FF"] },
  { id: "aurora", name: "Aurora", colors: ["#5B8DEF", "#62D0FF"] },
  { id: "horizon", name: "Horizon", colors: ["#3FA9FF", "#9CD7FF"] },
  { id: "nova", name: "Nova", colors: ["#1E88FF", "#5B8DEF"] },
];

const HANDLE_RE = /^[a-z0-9_]{0,24}$/;

const ACCESS_OPTIONS: {
  id: CommunityAccessType;
  title: string;
  body: string;
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  accent: string;
  comingSoon?: boolean;
}[] = [
  { id: "public", title: "Public", body: "Anyone can discover and join instantly.", icon: Globe, accent: Colors.mint },
  { id: "holders", title: "Holders only", body: "Members must hold $OGS to enter.", icon: Coins, accent: Colors.cyan, comingSoon: true },
  { id: "passcode", title: "Passcode", body: "Members enter the passcode you set.", icon: KeyRound, accent: Colors.orange, comingSoon: true },
  { id: "request", title: "Request to join", body: "You approve every member personally.", icon: UserCheck, accent: Colors.violet, comingSoon: true },
];

export default function CreateCommunityScreen() {
  const router = useRouter();
  const { createCommunity, communities } = useSocial();
  const { initialize: initializeAccess } = useCommunityAccess();
  const { profile } = useApp();
  const [step, setStep] = useState<Step>(0);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [name, setName] = useState<string>("");
  const [handle, setHandle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [emoji] = useState<string>("🚀");
  const [category, setCategory] = useState<Category>("alpha");
  const [paletteId, setPaletteId] = useState<string>("azure");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>("");
  const [rules, setRules] = useState<string[]>([
    "Be respectful to all members.",
    "No spam or shilling without alpha.",
    "Keep posts on-topic.",
  ]);
  const [ruleInput, setRuleInput] = useState<string>("");
  const [accessType, setAccessType] = useState<CommunityAccessType>("public");
  const [passcode, setPasscode] = useState<string>("");
  const [gateMinimumBalance, setGateMinimumBalance] = useState<string>("1000000");
  const isPrivate = accessType !== "public";
  const holderOnly = accessType === "holders";
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [uploadingKind, setUploadingKind] = useState<"avatar" | "banner" | null>(null);

  const palette = useMemo<[string, string]>(
    () => PALETTES.find((p) => p.id === paletteId)?.colors ?? PALETTES[0].colors,
    [paletteId],
  );

  const onPickImage = useCallback(
    async (kind: "avatar" | "banner") => {
      try {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Allow photo access to upload images.");
          return;
        }
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.85,
          allowsEditing: true,
          aspect: kind === "avatar" ? [1, 1] : [3, 1],
          base64: true,
        });
        if (res.canceled || !res.assets[0]?.uri) return;
        const asset = res.assets[0];
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setUploadingKind(kind);
        const slug = handle.trim().toLowerCase() || `c-${Date.now().toString(36)}`;
        const url = await uploadCommunityMedia(
          slug,
          kind,
          asset.uri,
          asset.base64 ?? null,
          asset.fileName ?? null,
          asset.mimeType ?? null,
        );
        if (kind === "avatar") setAvatarUrl(url);
        else setBannerUrl(url);
      } catch (e) {
        Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again");
      } finally {
        setUploadingKind(null);
      }
    },
    [handle],
  );

  const handleTaken = useMemo(() => {
    const h = handle.trim().toLowerCase();
    if (!h) return false;
    return communities.some((c) => c.handle.toLowerCase() === h);
  }, [communities, handle]);

  const handleValid = HANDLE_RE.test(handle.trim().toLowerCase());

  const canNext = (() => {
    if (step === 0)
      return (
        name.trim().length >= 3 &&
        handle.trim().length >= 3 &&
        handleValid &&
        !handleTaken
      );
    if (step === 1) return description.trim().length >= 10;
    return true;
  })();

  const onNext = useCallback(() => {
    if (!canNext) return;
    Haptics.selectionAsync().catch(() => {});
    setStep((s) => Math.min(3, s + 1) as Step);
  }, [canNext]);

  const onBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    if (step === 0) {
      navigateBack(router, "/communities");
      return;
    }
    setStep((s) => Math.max(0, s - 1) as Step);
  }, [router, step]);

  const onAddTag = useCallback(() => {
    const t = tagInput.trim().toLowerCase().replace(/^#/, "");
    if (!t || tags.includes(t)) return;
    if (tags.length >= 6) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setTags((prev) => [...prev, t]);
    setTagInput("");
  }, [tagInput, tags]);

  const onAddRule = useCallback(() => {
    const r = ruleInput.trim();
    if (!r) return;
    if (rules.length >= 8) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setRules((prev) => [...prev, r]);
    setRuleInput("");
  }, [ruleInput, rules]);

  const onSubmit = useCallback(async () => {
    if (submitting) return;
    if (accessType === "passcode" && passcode.trim().length < 4) {
      Alert.alert("Passcode too short", "Pick a passcode of at least 4 characters.");
      return;
    }
    setSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const created = await createCommunity({
        name: name.trim(),
        handle: handle.trim().toLowerCase(),
        description: description.trim(),
        category,
        iconEmoji: emoji,
        accent: palette,
        tags,
        rules,
        isPrivate: accessType !== "public",
        holderOnly: accessType === "holders",
        gateTokenMint: accessType === "holders" ? SOLTOOLS_TOKEN_MINT : null,
        gateMinimumBalance: accessType === "holders" ? Number(gateMinimumBalance) || 1 : null,
        ownerHandle: profile.handle || "",
        avatarUrl,
        bannerUrl,
        accessType,
        passcode: accessType === "passcode" ? passcode.trim() : null,
      });
      initializeAccess(created.id, {
        accessType,
        passcode: accessType === "passcode" ? passcode.trim() : null,
      });
      router.replace({ pathname: "/community/[id]", params: { id: created.id } });
    } catch (e) {
      console.log("[create-community] failed", e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      const anyErr = e as { message?: string; details?: string; hint?: string; code?: string } | null;
      const msg =
        (typeof anyErr?.message === "string" && anyErr.message.length > 0 && anyErr.message) ||
        (typeof anyErr?.details === "string" && anyErr.details.length > 0 && anyErr.details) ||
        (typeof anyErr?.hint === "string" && anyErr.hint.length > 0 && anyErr.hint) ||
        "Something went wrong creating your community. Please try again.";
      Alert.alert("Couldn't launch community", msg);
      setSubmitting(false);
    }
  }, [
    submitting,
    createCommunity,
    name,
    handle,
    description,
    category,
    emoji,
    palette,
    tags,
    rules,
    accessType,
    passcode,
    gateMinimumBalance,
    profile.handle,
    router,
    avatarUrl,
    bannerUrl,
    initializeAccess,
  ]);

  const meta = STEPS[step];

  return (
    <View style={styles.root} testID="create-community">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <AtmosphereBackground palette={palette} />

      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable onPress={onBack} style={styles.iconBtn} testID="create-back">
            {step === 0 ? (
              <X color={Colors.text} size={18} strokeWidth={2.8} />
            ) : (
              <ArrowLeft color={Colors.text} size={18} strokeWidth={2.8} />
            )}
          </Pressable>
          <View style={styles.topCenter}>
            <Text style={styles.topEyebrow}>{meta.eyebrow}</Text>
          </View>
          <View style={styles.iconBtn} />
        </View>

        <View style={styles.progressTrack}>
          <View style={styles.progressTrackBg} />
          <Animated.View style={[styles.progressTrackFill, { width: `${((step + 1) / 4) * 100}%` }]}>
            <LinearGradient
              colors={palette}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.kav}
          keyboardVerticalOffset={6}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.heroHeader}>
              <Text style={styles.heroTitle}>{meta.title}</Text>
              <Text style={styles.heroSubtitle}>{meta.subtitle}</Text>
            </View>

            <PreviewCard
              name={name || "Your community"}
              handle={handle || "handle"}
              description={
                description || "A short hook describing what your tribe is all about."
              }
              emoji={emoji}
              palette={palette}
              members={1}
              tags={tags}
              isPrivate={isPrivate || holderOnly}
              avatarUrl={avatarUrl}
              bannerUrl={bannerUrl}
              uploadingKind={uploadingKind}
              onPickAvatar={() => onPickImage("avatar")}
              onPickBanner={() => onPickImage("banner")}
            />

            {step === 0 ? (
              <StepIdentity
                name={name}
                onChangeName={setName}
                handle={handle}
                onChangeHandle={(t) =>
                  setHandle(t.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase().slice(0, 24))
                }
                handleValid={handleValid}
                handleTaken={handleTaken}
              />
            ) : null}

            {step === 1 ? (
              <StepStory
                description={description}
                onChangeDescription={setDescription}
                category={category}
                onChangeCategory={setCategory}
                paletteId={paletteId}
                onChangePalette={setPaletteId}
              />
            ) : null}

            {step === 2 ? (
              <StepRulesTags
                tags={tags}
                tagInput={tagInput}
                onChangeTagInput={setTagInput}
                onAddTag={onAddTag}
                onRemoveTag={(t) => setTags((prev) => prev.filter((x) => x !== t))}
                rules={rules}
                ruleInput={ruleInput}
                onChangeRuleInput={setRuleInput}
                onAddRule={onAddRule}
                onRemoveRule={(idx) =>
                  setRules((prev) => prev.filter((_, i) => i !== idx))
                }
                accessType={accessType}
                onChangeAccessType={setAccessType}
                passcode={passcode}
                onChangePasscode={setPasscode}
                gateMinimumBalance={gateMinimumBalance}
                onChangeGateMinimumBalance={setGateMinimumBalance}
              />
            ) : null}

            {step === 3 ? (
              <StepReview
                name={name}
                handle={handle}
                description={description}
                category={category}
                emoji={emoji}
                palette={palette}
                tags={tags}
                rules={rules}
                accessType={accessType}
                passcode={passcode}
                gateMinimumBalance={gateMinimumBalance}
              />
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <LinearGradient
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)", "#000"]}
              locations={[0, 0.4, 1]}
              style={styles.footerGradient}
              pointerEvents="none"
            />
            <View style={styles.footerInner}>
              {step > 0 ? (
                <Pressable onPress={onBack} style={styles.secondaryBtn} testID="create-prev">
                  <ArrowLeft color={Colors.text} size={16} strokeWidth={2.8} />
                  <Text style={styles.secondaryBtnText}>Back</Text>
                </Pressable>
              ) : null}
              {step < 3 ? (
                <Pressable
                  onPress={onNext}
                  disabled={!canNext}
                  style={[styles.cta, !canNext && styles.ctaDisabled, step === 0 && { flex: 1 }]}
                  testID="create-next"
                >
                  <LinearGradient
                    colors={palette}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <Text style={styles.ctaText}>{step === 2 ? "Review" : "Continue"}</Text>
                  <ArrowRight color={Colors.ink} size={16} strokeWidth={3} />
                </Pressable>
              ) : (
                <Pressable
                  onPress={onSubmit}
                  disabled={submitting}
                  style={[styles.cta, submitting && styles.ctaDisabled, { flex: 1 }]}
                  testID="create-submit"
                >
                  <LinearGradient
                    colors={palette}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <Sparkles color={Colors.ink} size={16} strokeWidth={3} />
                  <Text style={styles.ctaText}>
                    {submitting ? "Launching…" : "Launch community"}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function AtmosphereBackground({ palette }: { palette: [string, string] }) {
  const drift = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);

  const ty1 = drift.interpolate({ inputRange: [0, 1], outputRange: [-30, 30] });
  const ty2 = drift.interpolate({ inputRange: [0, 1], outputRange: [40, -40] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.blob, { top: -60, left: -40, backgroundColor: palette[0], transform: [{ translateY: ty1 }] }]} />
      <Animated.View style={[styles.blob, { top: 220, right: -80, backgroundColor: palette[1], transform: [{ translateY: ty2 }] }]} />
      <View style={styles.blobOverlay} />
    </View>
  );
}

function PreviewCard({
  name,
  handle,
  description,
  emoji,
  palette,
  members,
  tags,
  isPrivate,
  avatarUrl,
  bannerUrl,
  uploadingKind,
  onPickAvatar,
  onPickBanner,
}: {
  name: string;
  handle: string;
  description: string;
  emoji: string;
  palette: [string, string];
  members: number;
  tags: string[];
  isPrivate: boolean;
  avatarUrl: string | null;
  bannerUrl: string | null;
  uploadingKind: "avatar" | "banner" | null;
  onPickAvatar: () => void;
  onPickBanner: () => void;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });

  return (
    <View style={styles.preview}>
      <View style={styles.previewLivePill}>
        <View style={styles.previewLiveDot} />
        <Text style={styles.previewLiveText}>LIVE PREVIEW</Text>
      </View>
      <Pressable
        onPress={onPickBanner}
        disabled={uploadingKind !== null}
        style={styles.previewBanner}
        testID="preview-pick-banner"
      >
        <LinearGradient
          colors={[palette[0], palette[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {bannerUrl ? (
          <Image
            source={{ uri: bannerUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : null}
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <Animated.View
          style={[styles.previewBlob, { transform: [{ scale }] }]}
          pointerEvents="none"
        >
          {bannerUrl ? null : <Text style={styles.previewBlobText}>{emoji}</Text>}
        </Animated.View>
        <View style={styles.previewUploadBadge}>
          {uploadingKind === "banner" ? (
            <ActivityIndicator color={Colors.text} size="small" />
          ) : (
            <Camera color={Colors.text} size={12} strokeWidth={2.8} />
          )}
          <Text style={styles.previewUploadText}>{bannerUrl ? "Change" : "Banner"}</Text>
        </View>
        {isPrivate ? (
          <View style={styles.privateBadge}>
            <Lock color={Colors.text} size={9} strokeWidth={2.8} />
            <Text style={styles.privateBadgeText}>PRIVATE</Text>
          </View>
        ) : null}
      </Pressable>
      <View style={styles.previewBody}>
        <Pressable
          onPress={onPickAvatar}
          disabled={uploadingKind !== null}
          style={[styles.previewAvatar, { borderColor: "#0A0F1A" }]}
          testID="preview-pick-avatar"
        >
          <LinearGradient
            colors={[palette[0], palette[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : (
            <Text style={styles.previewAvatarEmoji}>{emoji}</Text>
          )}
          <View style={styles.previewAvatarCamera}>
            {uploadingKind === "avatar" ? (
              <ActivityIndicator color={Colors.text} size="small" />
            ) : (
              <Camera color={Colors.text} size={10} strokeWidth={3} />
            )}
          </View>
        </Pressable>
        <Text style={styles.previewName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.previewHandle} numberOfLines={1}>
          @{handle || "handle"}
        </Text>
        <Text style={styles.previewDesc} numberOfLines={2}>
          {description}
        </Text>
        <View style={styles.previewMeta}>
          <View style={styles.metaPill}>
            <Users color={Colors.muted} size={11} strokeWidth={2.6} />
            <Text style={styles.metaPillText}>{members} member</Text>
          </View>
          {tags.slice(0, 3).map((t) => (
            <View key={t} style={styles.metaPill}>
              <Text style={[styles.metaPillText, { color: palette[1] }]}>#{t}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function StepIdentity({
  name,
  onChangeName,
  handle,
  onChangeHandle,
  handleValid,
  handleTaken,
}: {
  name: string;
  onChangeName: (t: string) => void;
  handle: string;
  onChangeHandle: (t: string) => void;
  handleValid: boolean;
  handleTaken: boolean;
}) {
  const helperColor =
    handle.length === 0
      ? Colors.muted2
      : !handleValid || handleTaken
        ? "#FF7B8A"
        : "#62E2A8";
  return (
    <View style={styles.card}>
      <FieldLabel index="A">Community name</FieldLabel>
      <TextInput
        value={name}
        onChangeText={onChangeName}
        placeholder="Solana Apes"
        placeholderTextColor={Colors.muted2}
        style={styles.input}
        maxLength={32}
        autoCapitalize="words"
        testID="input-name"
      />
      <Text style={styles.helper}>{name.length}/32</Text>

      <FieldLabel index="B">Unique handle</FieldLabel>
      <View style={styles.inputRow}>
        <View style={styles.prefixBox}>
          <Hash color={Colors.muted} size={14} strokeWidth={2.6} />
        </View>
        <TextInput
          value={handle}
          onChangeText={onChangeHandle}
          placeholder="solana_apes"
          placeholderTextColor={Colors.muted2}
          style={[styles.input, { flex: 1, marginTop: 0 }]}
          autoCapitalize="none"
          autoCorrect={false}
          testID="input-handle"
        />
        {handle.length >= 3 && handleValid && !handleTaken ? (
          <View style={styles.validDot}>
            <Check color={Colors.ink} size={12} strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.helper, { color: helperColor }]}>
        {handle.length === 0
          ? "lowercase, numbers, underscores. 3–24 chars."
          : !handleValid
            ? "Only lowercase letters, numbers, and underscores."
            : handleTaken
              ? "That handle is already taken."
              : "Available — looking sharp."}
      </Text>

      <Text style={styles.hintBox}>
        Tap the preview banner or avatar above to upload images.
      </Text>
    </View>
  );
}

function StepStory({
  description,
  onChangeDescription,
  category,
  onChangeCategory,
  paletteId,
  onChangePalette,
}: {
  description: string;
  onChangeDescription: (t: string) => void;
  category: Category;
  onChangeCategory: (c: Category) => void;
  paletteId: string;
  onChangePalette: (id: string) => void;
}) {
  return (
    <View style={styles.card}>
      <FieldLabel index="A">Description</FieldLabel>
      <TextInput
        value={description}
        onChangeText={onChangeDescription}
        placeholder="What's this community for? Who should join?"
        placeholderTextColor={Colors.muted2}
        style={[styles.input, styles.textarea]}
        maxLength={240}
        multiline
        testID="input-description"
      />
      <Text style={styles.helper}>{description.length}/240</Text>

      <FieldLabel index="B">Category</FieldLabel>
      <View style={styles.tilesGrid}>
        {CATEGORIES.map((c) => {
          const active = c.id === category;
          return (
            <Pressable
              key={c.id}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChangeCategory(c.id);
              }}
              style={[styles.tile, active && styles.tileActive]}
              testID={`category-${c.id}`}
            >
              <Text style={styles.tileEmoji}>{c.emoji}</Text>
              <Text style={[styles.tileText, active && styles.tileTextActive]}>
                {c.label}
              </Text>
              {active ? <View style={styles.tileGlow} pointerEvents="none" /> : null}
            </Pressable>
          );
        })}
      </View>

      <FieldLabel index="C">Accent palette</FieldLabel>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.palettesRow}
      >
        {PALETTES.map((p) => {
          const active = p.id === paletteId;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChangePalette(p.id);
              }}
              style={styles.paletteCol}
              testID={`palette-${p.id}`}
            >
              <View style={[styles.paletteBtn, active && styles.paletteBtnActive]}>
                <LinearGradient
                  colors={p.colors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                {active ? (
                  <View style={styles.paletteCheck}>
                    <Check color={Colors.ink} size={14} strokeWidth={3.2} />
                  </View>
                ) : null}
              </View>
              <Text style={[styles.paletteName, active && { color: Colors.text }]}>
                {p.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function StepRulesTags({
  tags,
  tagInput,
  onChangeTagInput,
  onAddTag,
  onRemoveTag,
  rules,
  ruleInput,
  onChangeRuleInput,
  onAddRule,
  onRemoveRule,
  accessType,
  onChangeAccessType,
  passcode,
  onChangePasscode,
  gateMinimumBalance,
  onChangeGateMinimumBalance,
}: {
  tags: string[];
  tagInput: string;
  onChangeTagInput: (t: string) => void;
  onAddTag: () => void;
  onRemoveTag: (t: string) => void;
  rules: string[];
  ruleInput: string;
  onChangeRuleInput: (t: string) => void;
  onAddRule: () => void;
  onRemoveRule: (idx: number) => void;
  accessType: CommunityAccessType;
  onChangeAccessType: (t: CommunityAccessType) => void;
  passcode: string;
  onChangePasscode: (t: string) => void;
  gateMinimumBalance: string;
  onChangeGateMinimumBalance: (value: string) => void;
}) {
  const holderOnly = accessType === "holders";
  return (
    <View style={styles.card}>
      <FieldLabel index="A">Tags · {tags.length}/6</FieldLabel>
      <View style={styles.inputRow}>
        <View style={styles.prefixBox}>
          <Text style={styles.prefixHash}>#</Text>
        </View>
        <TextInput
          value={tagInput}
          onChangeText={onChangeTagInput}
          onSubmitEditing={onAddTag}
          placeholder="alpha"
          placeholderTextColor={Colors.muted2}
          style={[styles.input, { flex: 1, marginTop: 0 }]}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          testID="input-tag"
        />
        <Pressable onPress={onAddTag} style={styles.addBtn} testID="add-tag">
          <Plus color={Colors.ink} size={16} strokeWidth={3.2} />
        </Pressable>
      </View>
      {tags.length > 0 ? (
        <View style={styles.tagWrap}>
          {tags.map((t) => (
            <Pressable
              key={t}
              onPress={() => onRemoveTag(t)}
              style={styles.tagPill}
              testID={`tag-${t}`}
            >
              <Text style={styles.tagPillText}>#{t}</Text>
              <X color={Colors.muted} size={11} strokeWidth={2.6} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <FieldLabel index="B">House rules · {rules.length}/8</FieldLabel>
      <View style={styles.inputRow}>
        <TextInput
          value={ruleInput}
          onChangeText={onChangeRuleInput}
          onSubmitEditing={onAddRule}
          placeholder="Add a community rule"
          placeholderTextColor={Colors.muted2}
          style={[styles.input, { flex: 1, marginTop: 0 }]}
          returnKeyType="done"
          testID="input-rule"
        />
        <Pressable onPress={onAddRule} style={styles.addBtn} testID="add-rule">
          <Plus color={Colors.ink} size={16} strokeWidth={3.2} />
        </Pressable>
      </View>
      <View style={{ marginTop: 6 }}>
        {rules.map((r, i) => (
          <View key={`${i}-${r}`} style={styles.ruleRow}>
            <View style={styles.ruleNum}>
              <Text style={styles.ruleNumText}>{i + 1}</Text>
            </View>
            <Text style={styles.ruleText}>{r}</Text>
            <Pressable
              onPress={() => onRemoveRule(i)}
              hitSlop={6}
              testID={`remove-rule-${i}`}
            >
              <Trash2 color={Colors.muted} size={14} strokeWidth={2.4} />
            </Pressable>
          </View>
        ))}
      </View>

      <FieldLabel index="C">Who can join</FieldLabel>
      <View style={{ gap: 10, marginTop: 4 }}>
        {ACCESS_OPTIONS.map((opt) => {
          const active = opt.id === accessType;
          const Icon = opt.icon;
          const locked = !!opt.comingSoon;
          return (
            <Pressable
              key={opt.id}
              onPress={() => {
                if (locked) {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
                  Alert.alert("Coming soon", `${opt.title} communities are launching soon. For now, create a public community.`);
                  return;
                }
                Haptics.selectionAsync().catch(() => {});
                onChangeAccessType(opt.id);
              }}
              style={[
                styles.accessRow,
                active && { borderColor: opt.accent, backgroundColor: "rgba(255,255,255,0.06)" },
                locked && { opacity: 0.5 },
              ]}
              testID={`access-${opt.id}`}
            >
              <View style={[styles.privacyIcon, { backgroundColor: `${opt.accent}22` }]}>
                <Icon color={opt.accent} size={16} strokeWidth={2.6} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text style={styles.privacyTitle}>{opt.title}</Text>
                  {locked ? (
                    <View style={styles.soonPill}>
                      <Text style={styles.soonPillText}>SOON</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.privacyBody}>{opt.body}</Text>
              </View>
              <View style={[styles.radio, active && { borderColor: opt.accent }]}>
                {active ? <View style={[styles.radioDot, { backgroundColor: opt.accent }]} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {accessType === "passcode" ? (
        <>
          <FieldLabel index="D">Community passcode</FieldLabel>
          <TextInput
            value={passcode}
            onChangeText={onChangePasscode}
            placeholder="e.g. moonshot-2026"
            placeholderTextColor={Colors.muted2}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            maxLength={32}
            testID="input-passcode"
          />
          <Text style={styles.helper}>Share with people you want to let in. Minimum 4 characters.</Text>
        </>
      ) : null}

      {holderOnly ? (
        <>
          <FieldLabel index="D">Minimum $OGS balance</FieldLabel>
          <TextInput
            value={gateMinimumBalance}
            onChangeText={onChangeGateMinimumBalance}
            placeholder="1000000"
            placeholderTextColor={Colors.muted2}
            keyboardType="numeric"
            style={styles.input}
            testID="input-holder-minimum"
          />
        </>
      ) : null}
    </View>
  );
}

function StepReview({
  name,
  handle,
  description,
  category,
  emoji,
  palette,
  tags,
  rules,
  accessType,
  passcode,
  gateMinimumBalance,
}: {
  name: string;
  handle: string;
  description: string;
  category: Category;
  emoji: string;
  palette: [string, string];
  tags: string[];
  rules: string[];
  accessType: CommunityAccessType;
  passcode: string;
  gateMinimumBalance: string;
}) {
  const accessLabel =
    accessType === "holders"
      ? "Holders only"
      : accessType === "passcode"
        ? "Passcode locked"
        : accessType === "request"
          ? "Request to join"
          : "Public";
  const cat = CATEGORIES.find((c) => c.id === category);
  return (
    <View style={styles.card}>
      <View style={styles.reviewRow}>
        <Text style={styles.reviewLabel}>Name</Text>
        <Text style={styles.reviewValue}>{name}</Text>
      </View>
      <View style={styles.reviewRow}>
        <Text style={styles.reviewLabel}>Handle</Text>
        <Text style={styles.reviewValue}>@{handle}</Text>
      </View>
      <View style={styles.reviewRow}>
        <Text style={styles.reviewLabel}>Category</Text>
        <Text style={styles.reviewValue}>
          {cat?.emoji} {cat?.label}
        </Text>
      </View>
      <View style={styles.reviewRow}>
        <Text style={styles.reviewLabel}>Palette</Text>
        <View style={styles.reviewSwatch}>
          <LinearGradient
            colors={palette}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>
      <View style={styles.reviewRow}>
        <Text style={styles.reviewLabel}>Access</Text>
        <Text style={styles.reviewValue}>{accessLabel}</Text>
      </View>
      {accessType === "holders" ? (
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Gate</Text>
          <Text style={styles.reviewValue}>{Number(gateMinimumBalance || 0).toLocaleString()} $OGS</Text>
        </View>
      ) : null}
      {accessType === "passcode" ? (
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Passcode</Text>
          <Text style={styles.reviewValue}>{passcode ? "\u2022".repeat(Math.min(passcode.length, 8)) : "—"}</Text>
        </View>
      ) : null}

      <Text style={styles.reviewSection}>Description</Text>
      <Text style={styles.reviewBody}>{description}</Text>

      {tags.length > 0 ? (
        <>
          <Text style={styles.reviewSection}>Tags</Text>
          <View style={styles.tagWrap}>
            {tags.map((t) => (
              <View key={t} style={styles.tagPill}>
                <Text style={[styles.tagPillText, { color: palette[1] }]}>#{t}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {rules.length > 0 ? (
        <>
          <Text style={styles.reviewSection}>Rules</Text>
          {rules.map((r, i) => (
            <View key={`${i}-${r}`} style={styles.ruleRow}>
              <View style={styles.ruleNum}>
                <Text style={styles.ruleNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.ruleText}>{r}</Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

function FieldLabel({
  index,
  children,
}: {
  index: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.fieldLabel}>
      <View style={styles.fieldIndex}>
        <Text style={styles.fieldIndexText}>{index}</Text>
      </View>
      <Text style={styles.fieldLabelText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#02050B" },
  safe: { flex: 1 },
  kav: { flex: 1 },
  scroll: { padding: 18, paddingBottom: 140, gap: 18 },

  blob: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 999,
    opacity: 0.22,
  },
  blobOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,5,11,0.78)",
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 10,
  },
  topCenter: { alignItems: "center", justifyContent: "center", flex: 1 },
  topEyebrow: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },

  progressTrack: {
    height: 3,
    marginHorizontal: 18,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressTrackBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  progressTrackFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    overflow: "hidden",
    borderRadius: 2,
  },

  heroHeader: { gap: 6, paddingTop: 6 },
  heroTitle: {
    color: Colors.text,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  heroSubtitle: {
    color: Colors.muted,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },

  preview: {
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: "rgba(11,15,26,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  previewLivePill: {
    position: "absolute",
    top: 14,
    left: 14,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  previewLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#62E2A8",
  },
  previewLiveText: { color: Colors.text, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  previewBanner: { height: 150, overflow: "hidden", justifyContent: "flex-end" },
  previewBlob: {
    position: "absolute",
    right: 18,
    top: 18,
    opacity: 0.55,
  },
  previewBlobText: { fontSize: 96 },
  privateBadge: {
    position: "absolute",
    bottom: 14,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  privateBadgeText: { color: Colors.text, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  previewUploadBadge: {
    position: "absolute",
    right: 14,
    top: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  previewUploadText: { color: Colors.text, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },

  previewBody: { padding: 18 },
  previewAvatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginTop: -48,
    borderWidth: 4,
    marginBottom: 10,
  },
  previewAvatarEmoji: { fontSize: 30 },
  previewAvatarCamera: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    borderWidth: 1.5,
    borderColor: "#0A0F1A",
  },
  previewName: { color: Colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.6 },
  previewHandle: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 2 },
  previewDesc: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 10,
    lineHeight: 19,
    opacity: 0.85,
  },
  previewMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 14,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  metaPillText: { color: Colors.muted, fontSize: 11, fontWeight: "800" },

  card: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: "rgba(11,15,26,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 4,
  },

  fieldLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
  },
  fieldIndex: {
    width: 20,
    height: 20,
    borderRadius: 7,
    backgroundColor: "rgba(63,169,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  fieldIndexText: {
    color: Colors.mint,
    fontSize: 10,
    fontWeight: "900",
  },
  fieldLabelText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  input: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  textarea: { minHeight: 110, textAlignVertical: "top" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  prefixBox: {
    width: 40,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  prefixHash: { color: Colors.muted, fontSize: 16, fontWeight: "900" },
  validDot: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "#62E2A8",
    alignItems: "center",
    justifyContent: "center",
  },
  helper: { color: Colors.muted2, fontSize: 11, fontWeight: "700", marginTop: 8 },
  hintBox: {
    marginTop: 18,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(63,169,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(63,169,255,0.2)",
    color: Colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  addBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: Colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },

  tilesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  tile: {
    width: "23%",
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
    overflow: "hidden",
  },
  tileActive: {
    backgroundColor: "rgba(63,169,255,0.18)",
    borderColor: Colors.mint,
  },
  tileGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    backgroundColor: "rgba(63,169,255,0.06)",
  },
  tileEmoji: { fontSize: 22 },
  tileText: { color: Colors.muted, fontSize: 11, fontWeight: "800" },
  tileTextActive: { color: Colors.text },

  palettesRow: {
    paddingVertical: 4,
    paddingRight: 8,
    gap: 12,
    flexDirection: "row",
  },
  paletteCol: { alignItems: "center", gap: 6 },
  paletteBtn: {
    width: 64,
    height: 64,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.08)",
  },
  paletteBtnActive: { borderColor: Colors.text, borderWidth: 3 },
  paletteCheck: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  paletteName: {
    color: Colors.muted2,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tagPillText: { color: Colors.text, fontSize: 12, fontWeight: "800" },

  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  ruleNum: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: "rgba(63,169,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  ruleNumText: { color: Colors.mint, fontSize: 11, fontWeight: "900" },
  ruleText: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "500", lineHeight: 19 },

  accessRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 12,
  },
  privacyIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  privacyTitle: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  privacyBody: { color: Colors.muted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 10, height: 10, borderRadius: 999 },
  soonPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  soonPillText: { color: Colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },

  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  reviewLabel: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  reviewValue: { color: Colors.text, fontSize: 14, fontWeight: "800" },
  reviewSwatch: {
    width: 60,
    height: 22,
    borderRadius: 999,
    overflow: "hidden",
  },
  reviewSection: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 16,
  },
  reviewBody: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    marginTop: 8,
  },

  footer: {
    position: "relative",
  },
  footerGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    top: -28,
    bottom: 0,
    height: 200,
  },
  footerInner: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 22 : 14,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  secondaryBtnText: { color: Colors.text, fontSize: 14, fontWeight: "900" },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 18,
    overflow: "hidden",
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { color: Colors.ink, fontSize: 15, fontWeight: "900", letterSpacing: -0.2 },
});
