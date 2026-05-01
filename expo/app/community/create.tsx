import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Hash,
  Lock,
  Palette,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  Type,
  Unlock,
  Users,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useApp } from "@/providers/app-provider";
import { Community, useSocial } from "@/providers/social-provider";

type Step = 0 | 1 | 2 | 3;
type Category = Community["category"];

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

const EMOJI_PICKS = [
  "🚀",
  "✨",
  "🦄",
  "🐋",
  "🧠",
  "📈",
  "🎨",
  "☀️",
  "🔥",
  "💎",
  "🪐",
  "⚡",
  "🐸",
  "🌈",
  "🦊",
  "🦅",
  "🐉",
  "🌊",
  "👽",
  "🛸",
  "💀",
  "🦾",
  "🎯",
  "🏴‍☠️",
];

const PALETTES: { id: string; colors: [string, string] }[] = [
  { id: "mint", colors: [Colors.mint, Colors.cyan] },
  { id: "cyan", colors: [Colors.cyan, Colors.violet] },
  { id: "violet", colors: [Colors.violet, Colors.neon] },
  { id: "rose", colors: [Colors.rose, Colors.orange] },
  { id: "orange", colors: [Colors.orange, Colors.rose] },
  { id: "neon", colors: [Colors.neon, Colors.cyan] },
  { id: "magenta", colors: [Colors.magenta, Colors.violet] },
  { id: "ember", colors: ["#FF8A3C", "#FF3D8A"] },
  { id: "ocean", colors: ["#3DA9FC", "#36F1CD"] },
  { id: "forest", colors: ["#36F1CD", "#A6FF6E"] },
];

const HANDLE_RE = /^[a-z0-9_]{0,24}$/;

export default function CreateCommunityScreen() {
  const router = useRouter();
  const { createCommunity, communities } = useSocial();
  const { profile } = useApp();
  const [step, setStep] = useState<Step>(0);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [name, setName] = useState<string>("");
  const [handle, setHandle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [emoji, setEmoji] = useState<string>("🚀");
  const [category, setCategory] = useState<Category>("alpha");
  const [paletteId, setPaletteId] = useState<string>("mint");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>("");
  const [rules, setRules] = useState<string[]>([
    "Be respectful to all members.",
    "No spam or shilling without alpha.",
    "Keep posts on-topic.",
  ]);
  const [ruleInput, setRuleInput] = useState<string>("");
  const [isPrivate, setIsPrivate] = useState<boolean>(false);

  const palette = useMemo(
    () => PALETTES.find((p) => p.id === paletteId)?.colors ?? PALETTES[0].colors,
    [paletteId],
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
    if (step === 2) return true;
    return true;
  })();

  const onNext = useCallback(() => {
    if (!canNext) return;
    Haptics.selectionAsync().catch(() => {});
    setStep((s) => Math.min(3, (s + 1) as Step));
  }, [canNext]);

  const onBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    if (step === 0) {
      router.back();
      return;
    }
    setStep((s) => Math.max(0, (s - 1) as Step));
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
        isPrivate,
        ownerHandle: profile.handle || "",
      });
      router.replace({ pathname: "/community/[id]", params: { id: created.id } });
    } catch (e) {
      console.log("[create-community] failed", e);
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
    isPrivate,
    profile.handle,
    router,
  ]);

  return (
    <View style={styles.root} testID="create-community">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable onPress={onBack} style={styles.iconBtn} testID="create-back">
            {step === 0 ? (
              <X color={Colors.text} size={20} strokeWidth={2.6} />
            ) : (
              <ArrowLeft color={Colors.text} size={20} strokeWidth={2.6} />
            )}
          </Pressable>
          <View style={styles.stepDots}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === step && styles.dotActive,
                  i < step && styles.dotDone,
                ]}
              />
            ))}
          </View>
          <View style={styles.iconBtn} />
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
              isPrivate={isPrivate}
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
                emoji={emoji}
                onChangeEmoji={setEmoji}
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
                isPrivate={isPrivate}
                onTogglePrivate={() => setIsPrivate((p) => !p)}
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
                isPrivate={isPrivate}
              />
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {step < 3 ? (
              <Pressable
                onPress={onNext}
                disabled={!canNext}
                style={[styles.cta, !canNext && styles.ctaDisabled]}
                testID="create-next"
              >
                <LinearGradient
                  colors={palette}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.ctaText}>Continue</Text>
                <ArrowRight color={Colors.ink} size={18} strokeWidth={3} />
              </Pressable>
            ) : (
              <Pressable
                onPress={onSubmit}
                disabled={submitting}
                style={[styles.cta, submitting && styles.ctaDisabled]}
                testID="create-submit"
              >
                <LinearGradient
                  colors={palette}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Sparkles color={Colors.ink} size={18} strokeWidth={3} />
                <Text style={styles.ctaText}>
                  {submitting ? "Launching..." : "Launch community"}
                </Text>
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
}: {
  name: string;
  handle: string;
  description: string;
  emoji: string;
  palette: [string, string];
  members: number;
  tags: string[];
  isPrivate: boolean;
}) {
  const pulse = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  return (
    <View style={styles.preview}>
      <View style={styles.previewBanner}>
        <LinearGradient
          colors={[palette[0], palette[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          style={[styles.previewBlob, { transform: [{ scale }] }]}
          pointerEvents="none"
        >
          <Text style={styles.previewBlobText}>{emoji}</Text>
        </Animated.View>
        {isPrivate ? (
          <View style={styles.privateBadge}>
            <Lock color={Colors.text} size={10} strokeWidth={2.8} />
            <Text style={styles.privateBadgeText}>PRIVATE</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.previewBody}>
        <View style={[styles.previewAvatar, { borderColor: Colors.ink }]}>
          <LinearGradient
            colors={[palette[0], palette[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.previewAvatarEmoji}>{emoji}</Text>
        </View>
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
            <Text style={styles.metaPillText}>{members}</Text>
          </View>
          {tags.slice(0, 3).map((t) => (
            <View key={t} style={styles.metaPill}>
              <Text style={[styles.metaPillText, { color: palette[0] }]}>#{t}</Text>
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
  emoji,
  onChangeEmoji,
}: {
  name: string;
  onChangeName: (t: string) => void;
  handle: string;
  onChangeHandle: (t: string) => void;
  handleValid: boolean;
  handleTaken: boolean;
  emoji: string;
  onChangeEmoji: (t: string) => void;
}) {
  return (
    <View style={styles.card}>
      <SectionTitle icon={Sparkles} eyebrow="Step 1 of 4" title="Identity" />

      <FieldLabel icon={Type}>Community name</FieldLabel>
      <TextInput
        value={name}
        onChangeText={onChangeName}
        placeholder="Solana Apes"
        placeholderTextColor={Colors.muted}
        style={styles.input}
        maxLength={32}
        autoCapitalize="words"
        testID="input-name"
      />

      <FieldLabel icon={Hash}>Unique handle</FieldLabel>
      <View style={styles.inputRow}>
        <Text style={styles.prefix}>@</Text>
        <TextInput
          value={handle}
          onChangeText={onChangeHandle}
          placeholder="solana_apes"
          placeholderTextColor={Colors.muted}
          style={[styles.input, { flex: 1, marginTop: 0 }]}
          autoCapitalize="none"
          autoCorrect={false}
          testID="input-handle"
        />
      </View>
      <Text
        style={[
          styles.helper,
          (handle.length > 0 && (!handleValid || handleTaken)) && { color: Colors.rose },
        ]}
      >
        {handle.length === 0
          ? "Lowercase letters, numbers, underscores. 3–24 chars."
          : !handleValid
            ? "Only lowercase letters, numbers, and underscores."
            : handleTaken
              ? "That handle is already taken."
              : "Looks good — handle is available."}
      </Text>

      <FieldLabel icon={Sparkles}>Pick a vibe</FieldLabel>
      <View style={styles.emojiGrid}>
        {EMOJI_PICKS.map((e) => {
          const active = e === emoji;
          return (
            <Pressable
              key={e}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChangeEmoji(e);
              }}
              style={[styles.emojiBtn, active && styles.emojiBtnActive]}
              testID={`emoji-${e}`}
            >
              <Text style={styles.emojiText}>{e}</Text>
            </Pressable>
          );
        })}
      </View>
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
      <SectionTitle icon={BookOpen} eyebrow="Step 2 of 4" title="Story & style" />

      <FieldLabel icon={BookOpen}>Description</FieldLabel>
      <TextInput
        value={description}
        onChangeText={onChangeDescription}
        placeholder="What's this community for? Who should join?"
        placeholderTextColor={Colors.muted}
        style={[styles.input, styles.textarea]}
        maxLength={240}
        multiline
        testID="input-description"
      />
      <Text style={styles.helper}>{description.length}/240</Text>

      <FieldLabel icon={Tag}>Category</FieldLabel>
      <View style={styles.chipsWrap}>
        {CATEGORIES.map((c) => {
          const active = c.id === category;
          return (
            <Pressable
              key={c.id}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChangeCategory(c.id);
              }}
              style={[styles.chip, active && styles.chipActive]}
              testID={`category-${c.id}`}
            >
              <Text style={styles.chipEmoji}>{c.emoji}</Text>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FieldLabel icon={Palette}>Accent palette</FieldLabel>
      <View style={styles.palettesRow}>
        {PALETTES.map((p) => {
          const active = p.id === paletteId;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChangePalette(p.id);
              }}
              style={[styles.paletteBtn, active && styles.paletteBtnActive]}
              testID={`palette-${p.id}`}
            >
              <LinearGradient
                colors={p.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {active ? (
                <View style={styles.paletteCheck}>
                  <Check color={Colors.ink} size={14} strokeWidth={3} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
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
  isPrivate,
  onTogglePrivate,
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
  isPrivate: boolean;
  onTogglePrivate: () => void;
}) {
  return (
    <View style={styles.card}>
      <SectionTitle icon={BookOpen} eyebrow="Step 3 of 4" title="Tags & rules" />

      <FieldLabel icon={Tag}>Tags ({tags.length}/6)</FieldLabel>
      <View style={styles.inputRow}>
        <Text style={styles.prefix}>#</Text>
        <TextInput
          value={tagInput}
          onChangeText={onChangeTagInput}
          onSubmitEditing={onAddTag}
          placeholder="alpha"
          placeholderTextColor={Colors.muted}
          style={[styles.input, { flex: 1, marginTop: 0 }]}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          testID="input-tag"
        />
        <Pressable onPress={onAddTag} style={styles.addBtn} testID="add-tag">
          <Plus color={Colors.ink} size={16} strokeWidth={3} />
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

      <FieldLabel icon={BookOpen}>Rules ({rules.length}/8)</FieldLabel>
      <View style={styles.inputRow}>
        <TextInput
          value={ruleInput}
          onChangeText={onChangeRuleInput}
          onSubmitEditing={onAddRule}
          placeholder="Add a community rule"
          placeholderTextColor={Colors.muted}
          style={[styles.input, { flex: 1, marginTop: 0 }]}
          returnKeyType="done"
          testID="input-rule"
        />
        <Pressable onPress={onAddRule} style={styles.addBtn} testID="add-rule">
          <Plus color={Colors.ink} size={16} strokeWidth={3} />
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

      <View style={styles.privacyRow}>
        <View style={styles.privacyLeft}>
          <View style={styles.privacyIcon}>
            {isPrivate ? (
              <Lock color={Colors.orange} size={16} strokeWidth={2.6} />
            ) : (
              <Unlock color={Colors.mint} size={16} strokeWidth={2.6} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyTitle}>
              {isPrivate ? "Private community" : "Public community"}
            </Text>
            <Text style={styles.privacyBody}>
              {isPrivate
                ? "Only invited members can see posts."
                : "Anyone can discover and join."}
            </Text>
          </View>
        </View>
        <Switch
          value={isPrivate}
          onValueChange={onTogglePrivate}
          trackColor={{ false: "rgba(255,255,255,0.12)", true: Colors.orange }}
          thumbColor={Colors.text}
          testID="switch-private"
        />
      </View>
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
  isPrivate,
}: {
  name: string;
  handle: string;
  description: string;
  category: Category;
  emoji: string;
  palette: [string, string];
  tags: string[];
  rules: string[];
  isPrivate: boolean;
}) {
  const cat = CATEGORIES.find((c) => c.id === category);
  return (
    <View style={styles.card}>
      <SectionTitle icon={Check} eyebrow="Step 4 of 4" title="Ready to launch?" />

      <View style={styles.reviewRow}>
        <Text style={styles.reviewLabel}>Name</Text>
        <Text style={styles.reviewValue}>{name}</Text>
      </View>
      <View style={styles.reviewRow}>
        <Text style={styles.reviewLabel}>Handle</Text>
        <Text style={styles.reviewValue}>@{handle}</Text>
      </View>
      <View style={styles.reviewRow}>
        <Text style={styles.reviewLabel}>Vibe</Text>
        <Text style={styles.reviewValue}>{emoji}</Text>
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
        <Text style={styles.reviewLabel}>Privacy</Text>
        <Text style={styles.reviewValue}>{isPrivate ? "Private" : "Public"}</Text>
      </View>

      <Text style={styles.reviewSection}>Description</Text>
      <Text style={styles.reviewBody}>{description}</Text>

      {tags.length > 0 ? (
        <>
          <Text style={styles.reviewSection}>Tags</Text>
          <View style={styles.tagWrap}>
            {tags.map((t) => (
              <View key={t} style={styles.tagPill}>
                <Text style={[styles.tagPillText, { color: palette[0] }]}>#{t}</Text>
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

function SectionTitle({
  icon: Icon,
  eyebrow,
  title,
}: {
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  eyebrow: string;
  title: string;
}) {
  return (
    <View style={styles.sectionTitleWrap}>
      <View style={styles.sectionEyebrowRow}>
        <Icon color={Colors.mint} size={14} strokeWidth={2.6} />
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function FieldLabel({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.fieldLabel}>
      <Icon color={Colors.muted} size={12} strokeWidth={2.6} />
      <Text style={styles.fieldLabelText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  safe: { flex: 1 },
  kav: { flex: 1 },
  scroll: { padding: 18, paddingBottom: 32, gap: 18 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDots: { flexDirection: "row", gap: 6 },
  dot: {
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  dotActive: { backgroundColor: Colors.mint, width: 36 },
  dotDone: { backgroundColor: "rgba(85,245,178,0.45)" },

  preview: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  previewBanner: { height: 140, overflow: "hidden", justifyContent: "flex-end" },
  previewBlob: {
    position: "absolute",
    right: 18,
    top: 18,
    opacity: 0.5,
  },
  previewBlobText: { fontSize: 88 },
  privateBadge: {
    position: "absolute",
    top: 14,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  privateBadgeText: { color: Colors.text, fontSize: 9, fontWeight: "900", letterSpacing: 1 },

  previewBody: { padding: 16 },
  previewAvatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginTop: -44,
    borderWidth: 3,
    marginBottom: 8,
  },
  previewAvatarEmoji: { fontSize: 28 },
  previewName: { color: Colors.text, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  previewHandle: { color: Colors.muted, fontSize: 12, fontWeight: "700", marginTop: 2 },
  previewDesc: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 8,
    lineHeight: 18,
    opacity: 0.85,
  },
  previewMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  metaPillText: { color: Colors.muted, fontSize: 11, fontWeight: "800" },

  card: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 4,
  },
  sectionTitleWrap: { marginBottom: 6 },
  sectionEyebrowRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionEyebrow: {
    color: Colors.mint,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginTop: 4,
  },

  fieldLabel: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16 },
  fieldLabelText: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  input: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  textarea: { minHeight: 92, textAlignVertical: "top" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  prefix: {
    color: Colors.muted,
    fontSize: 16,
    fontWeight: "900",
    paddingHorizontal: 4,
  },
  helper: { color: Colors.muted, fontSize: 11, fontWeight: "700", marginTop: 6 },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },

  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  emojiBtnActive: {
    backgroundColor: "rgba(85,245,178,0.16)",
    borderColor: Colors.mint,
  },
  emojiText: { fontSize: 22 },

  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipActive: {
    backgroundColor: "rgba(85,245,178,0.16)",
    borderColor: Colors.mint,
  },
  chipEmoji: { fontSize: 14 },
  chipText: { color: Colors.muted, fontSize: 13, fontWeight: "800" },
  chipTextActive: { color: Colors.text },

  palettesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  paletteBtn: {
    width: 56,
    height: 56,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  paletteBtnActive: { borderColor: Colors.text },
  paletteCheck: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
  },

  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tagPillText: { color: Colors.text, fontSize: 12, fontWeight: "800" },

  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  ruleNum: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  ruleNumText: { color: Colors.text, fontSize: 11, fontWeight: "900" },
  ruleText: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "500", lineHeight: 19 },

  privacyRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 12,
  },
  privacyLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
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

  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
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
    width: 56,
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
    marginTop: 14,
  },
  reviewBody: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    marginTop: 6,
  },

  footer: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 18 : 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: Colors.ink,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 18,
    overflow: "hidden",
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: Colors.ink, fontSize: 15, fontWeight: "900", letterSpacing: -0.2 },
});
