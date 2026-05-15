import { BlurView } from "expo-blur";
import GlassBg from "@/components/ui/GlassBg";
import { AlertOctagon, Check, Flag, X } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { REPORT_CATEGORIES, useReports, type ReportTargetType } from "@/providers/reports-provider";

const TARGET_LABELS: Record<ReportTargetType, string> = {
  post: "Post",
  comment: "Comment",
  reel: "Reel",
  story: "Story",
  story_comment: "Story comment",
  user: "User",
  community: "Community",
  token: "Token / coin",
};

export default function ReportSheet() {
  const { visible, target, close, submit } = useReports();
  const [category, setCategory] = useState<string>("spam");
  const [details, setDetails] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  const reset = useCallback(() => {
    setCategory("spam");
    setDetails("");
    setSubmitting(false);
  }, []);

  const handleDismiss = useCallback(() => {
    if (submitting) return;
    reset();
    close();
  }, [close, reset, submitting]);

  const handleSubmit = useCallback(async () => {
    if (!target) return;
    setSubmitting(true);
    try {
      await submit({ target, category, details });
      Alert.alert("Report sent", "Thanks. Our moderation team will review it.");
      reset();
      close();
    } catch (e) {
      setSubmitting(false);
      Alert.alert("Could not send report", e instanceof Error ? e.message : "Try again in a moment.");
    }
  }, [category, close, details, reset, submit, target]);

  const heading = useMemo(() => {
    if (!target) return "Report";
    const label = target.label?.trim();
    const base = `Report ${TARGET_LABELS[target.type] ?? "content"}`;
    return label ? `${base} · ${label}` : base;
  }, [target]);

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={handleDismiss}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
        <View style={styles.sheet}>
          <GlassBg intensity={70} tint="dark" />
          <SafeAreaView edges={["bottom"]} style={styles.sheetInner}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.iconWrap}>
                <Flag color={Colors.rose} size={18} strokeWidth={2.6} />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>REPORT</Text>
                <Text style={styles.title} numberOfLines={2}>{heading}</Text>
              </View>
              <Pressable onPress={handleDismiss} hitSlop={10} style={styles.closeBtn}>
                <X color={Colors.muted} size={18} strokeWidth={2.6} />
              </Pressable>
            </View>

            <Text style={styles.subtitle}>Pick a reason. Reports stay anonymous to the person you're reporting.</Text>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollPad} showsVerticalScrollIndicator={false}>
              {REPORT_CATEGORIES.map((cat) => {
                const active = cat.id === category;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => setCategory(cat.id)}
                    style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && styles.pressed]}
                    testID={`report-cat-${cat.id}`}
                  >
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active ? <Check color={Colors.ink} size={11} strokeWidth={3.2} /> : null}
                    </View>
                    <View style={styles.optionCopy}>
                      <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{cat.label}</Text>
                      {cat.description ? <Text style={styles.optionDesc}>{cat.description}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}

              <View style={styles.detailsBlock}>
                <Text style={styles.detailsLabel}>Add more context (optional)</Text>
                <TextInput
                  value={details}
                  onChangeText={setDetails}
                  multiline
                  placeholder="Anything moderators should know…"
                  placeholderTextColor={Colors.muted2}
                  style={styles.detailsInput}
                  maxLength={500}
                  testID="report-details"
                />
                <Text style={styles.charCount}>{details.length}/500</Text>
              </View>
            </ScrollView>

            <View style={styles.footer}>
              <Pressable
                onPress={handleSubmit}
                disabled={submitting || !target}
                style={({ pressed }) => [styles.submitBtn, submitting && styles.submitBtnBusy, pressed && !submitting && styles.pressedDeep]}
                testID="report-submit"
              >
                {submitting ? (
                  <ActivityIndicator color={Colors.ink} size="small" />
                ) : (
                  <>
                    <AlertOctagon color={Colors.ink} size={14} strokeWidth={3} />
                    <Text style={styles.submitText}>Send report</Text>
                  </>
                )}
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2,3,6,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden", maxHeight: "92%" as const },
  sheetInner: { backgroundColor: "rgba(10,12,20,0.92)", paddingHorizontal: 18 },
  handle: { alignSelf: "center", width: 42, height: 5, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.18)", marginTop: 10, marginBottom: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,77,109,0.16)", borderWidth: 1, borderColor: "rgba(255,77,109,0.32)" },
  headerCopy: { flex: 1 },
  eyebrow: { color: Colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  title: { color: Colors.text, fontSize: 18, fontWeight: "900", marginTop: 2 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  subtitle: { color: Colors.muted, fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 12 },
  scroll: { maxHeight: 460 },
  scrollPad: { paddingBottom: 12 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14, marginBottom: 8, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  optionActive: { backgroundColor: "rgba(244,198,91,0.10)", borderColor: "rgba(244,198,91,0.4)" },
  pressed: { opacity: 0.78 },
  pressedDeep: { transform: [{ scale: 0.98 }] },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.muted2, alignItems: "center", justifyContent: "center" },
  radioActive: { backgroundColor: Colors.goldBright, borderColor: Colors.goldBright },
  optionCopy: { flex: 1 },
  optionLabel: { color: Colors.text, fontSize: 14, fontWeight: "700" },
  optionLabelActive: { color: Colors.goldBright },
  optionDesc: { color: Colors.muted, fontSize: 12, marginTop: 2 },
  detailsBlock: { marginTop: 10 },
  detailsLabel: { color: Colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1.4, marginBottom: 8 },
  detailsInput: { minHeight: 88, color: Colors.text, fontSize: 14, padding: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", textAlignVertical: "top" },
  charCount: { color: Colors.muted2, fontSize: 11, textAlign: "right", marginTop: 4 },
  footer: { paddingTop: 12, paddingBottom: 4 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.goldBright, paddingVertical: 14, borderRadius: 16 },
  submitBtnBusy: { opacity: 0.7 },
  submitText: { color: Colors.ink, fontSize: 14, fontWeight: "900" },
});
