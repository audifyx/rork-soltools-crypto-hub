import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

const BUCKET = "profile-media";
const POSTS_BUCKET = "post-images";
const STORY_BUCKET = "story-media";

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

/**
 * Uploads a local image URI to the post-images bucket. Returns a public URL.
 */
export async function uploadPostImage(userId: string, uri: string): Promise<string> {
  const ext = extFromUri(uri, "jpg");
  const path = `${userId}/post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
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
    console.log("[upload] post fetch failed", e);
    throw new Error("Could not read selected image");
  }

  const { error } = await supabase.storage
    .from(POSTS_BUCKET)
    .upload(path, body as ArrayBuffer, { contentType: ct, upsert: true });

  if (error) {
    console.log("[upload] post storage error", error.message);
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(POSTS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Uploads a local image URI to the story-media bucket. Returns a public URL.
 * Stories are ephemeral but the underlying media is kept until the row expires.
 */
export async function uploadStoryMedia(userId: string, uri: string): Promise<string> {
  const ext = extFromUri(uri, "jpg");
  const path = `${userId}/story-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
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
    console.log("[upload] story fetch failed", e);
    throw new Error("Could not read selected image");
  }

  const { error } = await supabase.storage
    .from(STORY_BUCKET)
    .upload(path, body as ArrayBuffer, { contentType: ct, upsert: true });

  if (error) {
    console.log("[upload] story storage error", error.message);
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(STORY_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
