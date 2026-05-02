import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

const BUCKET = "profile-media";
const POSTS_BUCKET = "post-images";

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
 * Decode a base64 string into a Uint8Array. Works in RN/Hermes
 * where Buffer is not available.
 */
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "");
  if (typeof globalThis.atob === "function") {
    const bin = globalThis.atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const len = clean.length;
  let bufferLength = (len * 3) >> 2;
  if (clean[len - 1] === "=") bufferLength--;
  if (clean[len - 2] === "=") bufferLength--;
  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup[clean.charCodeAt(i)];
    const b = lookup[clean.charCodeAt(i + 1)];
    const c = lookup[clean.charCodeAt(i + 2)];
    const d = lookup[clean.charCodeAt(i + 3)];
    if (p < bufferLength) bytes[p++] = (a << 2) | (b >> 4);
    if (p < bufferLength) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < bufferLength) bytes[p++] = ((c & 3) << 6) | (d & 63);
  }
  return bytes;
}

async function readBody(uri: string, base64?: string | null): Promise<ArrayBuffer | Blob> {
  if (Platform.OS === "web") {
    const res = await fetch(uri);
    return await res.blob();
  }
  if (base64 && base64.length > 0) {
    const bytes = base64ToBytes(base64);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
  const res = await fetch(uri);
  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) {
    throw new Error("Empty image — try picking a different photo");
  }
  return buf;
}

/**
 * Uploads a local image URI (camera roll) to the profile-media bucket.
 * Returns a public URL on success.
 */
export async function uploadProfileMedia(
  userId: string,
  kind: ProfileMediaKind,
  uri: string,
  base64?: string | null,
): Promise<string> {
  const ext = extFromUri(uri, "jpg");
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const ct = contentType(ext);

  let body: ArrayBuffer | Blob;
  try {
    body = await readBody(uri, base64);
  } catch (e) {
    console.log("[upload] read failed", e);
    throw new Error(e instanceof Error ? e.message : "Could not read selected image");
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
export async function uploadPostImage(
  userId: string,
  uri: string,
  base64?: string | null,
): Promise<string> {
  const ext = extFromUri(uri, "jpg");
  const path = `${userId}/post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const ct = contentType(ext);

  let body: ArrayBuffer | Blob;
  try {
    body = await readBody(uri, base64);
  } catch (e) {
    console.log("[upload] post read failed", e);
    throw new Error(e instanceof Error ? e.message : "Could not read selected image");
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

