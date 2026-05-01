import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

const BUCKET = "profile-media";

export type ProfileMediaKind = "avatar" | "banner";

function extFromUri(uri: string, fallback = "jpg"): string {
  const m = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return (m?.[1] ?? fallback).toLowerCase().replace(/[^a-z0-9]/g, "") || fallback;
}

function contentType(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

/**
 * Uploads a local image URI (camera roll) to the profile-media bucket.
 * Returns a public URL on success.
 */
export async function uploadProfileMedia(
  userId: string,
  kind: ProfileMediaKind,
  uri: string,
): Promise<string> {
  const ext = extFromUri(uri, "jpg");
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const ct = contentType(ext);

  let body: ArrayBuffer | Blob;
  try {
    if (Platform.OS === "web") {
      const res = await fetch(uri);
      body = await res.blob();
    } else {
      const res = await fetch(uri);
      body = await res.arrayBuffer();
    }
  } catch (e) {
    console.log("[upload] fetch failed", e);
    throw new Error("Could not read selected image");
  }

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body as ArrayBuffer, {
      contentType: ct,
      upsert: true,
    });

  if (error) {
    console.log("[upload] storage error", error.message);
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
