import { useEffect, useRef } from "react";

import { supabase } from "@/lib/supabase";

export function useRealtimeCleanup(channels: string[]) {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      channels.forEach((channelName) => {
        try {
          const found = supabase
            .getChannels()
            .filter((channel) => channel.topic === channelName);

          found.forEach((channel) => {
            supabase.removeChannel(channel).catch(() => {});
          });
        } catch (error) {
          console.log("[realtime-cleanup] failed", channelName, error);
        }
      });
    };
  }, [channels]);

  return mountedRef;
}
