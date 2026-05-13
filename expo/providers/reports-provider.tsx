import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

export type ReportTargetType =
  | "post"
  | "comment"
  | "reel"
  | "story"
  | "story_comment"
  | "user"
  | "community"
  | "token";

export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  label?: string;
}

export interface ReportCategory {
  id: string;
  label: string;
  description?: string;
}

export const REPORT_CATEGORIES: ReportCategory[] = [
  { id: "spam", label: "Spam", description: "Repetitive, unwanted, or promotional content." },
  { id: "scam", label: "Scam / fraud", description: "Rug pulls, fake giveaways, phishing." },
  { id: "harassment", label: "Harassment", description: "Targeted bullying or threats." },
  { id: "hate", label: "Hate speech", description: "Slurs, discrimination, or violence." },
  { id: "nsfw", label: "NSFW", description: "Nudity or sexual content." },
  { id: "violence", label: "Violence or gore", description: "Graphic violent imagery." },
  { id: "misinformation", label: "Misinformation", description: "False or misleading claims." },
  { id: "impersonation", label: "Impersonation", description: "Pretending to be someone else." },
  { id: "self_harm", label: "Self-harm", description: "Promotes self-harm or suicide." },
  { id: "illegal", label: "Illegal activity", description: "Drugs, weapons, exploitation." },
  { id: "copyright", label: "Copyright / IP", description: "Stolen or copyrighted content." },
  { id: "other", label: "Something else", description: "Doesn't fit a category above." },
];

interface ReportState {
  visible: boolean;
  target: ReportTarget | null;
}

export const [ReportsProvider, useReports] = createContextHook(() => {
  const { userId, isAuthenticated } = useAuth();
  const [state, setState] = useState<ReportState>({ visible: false, target: null });

  const open = useCallback((target: ReportTarget) => {
    setState({ visible: true, target });
  }, []);

  const close = useCallback(() => {
    setState({ visible: false, target: null });
  }, []);

  const submit = useCallback(
    async (input: { target: ReportTarget; category: string; details?: string }): Promise<string> => {
      if (!isAuthenticated || !userId) throw new Error("Sign in to send a report.");
      const { data, error } = await supabase.rpc("submit_report", {
        p_target_type: input.target.type,
        p_target_id: input.target.id,
        p_category: input.category,
        p_details: input.details ?? null,
      });
      if (error) {
        console.log("[reports] submit_report failed", error.message);
        throw new Error(error.message || "Could not send report.");
      }
      return (data as string) ?? "";
    },
    [isAuthenticated, userId],
  );

  return useMemo(
    () => ({
      visible: state.visible,
      target: state.target,
      open,
      close,
      submit,
    }),
    [state.target, state.visible, open, close, submit],
  );
});
