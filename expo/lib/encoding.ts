const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decode a base64 string into bytes without relying on Node Buffer. */
export function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (typeof globalThis.atob === "function") {
    const bin = globalThis.atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  const lookup = new Uint8Array(256);
  for (let i = 0; i < BASE64_CHARS.length; i += 1) lookup[BASE64_CHARS.charCodeAt(i)] = i;
  const len = clean.length;
  let bufferLength = (len * 3) >> 2;
  if (clean[len - 1] === "=") bufferLength -= 1;
  if (clean[len - 2] === "=") bufferLength -= 1;
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

/** Encode bytes as base64 without relying on Node Buffer. */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof globalThis.btoa === "function") {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return globalThis.btoa(bin);
  }
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    out += BASE64_CHARS[bytes[i] >> 2];
    out += BASE64_CHARS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    out += BASE64_CHARS[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    out += BASE64_CHARS[bytes[i + 2] & 63];
  }
  if (i < bytes.length) {
    out += BASE64_CHARS[bytes[i] >> 2];
    if (i + 1 < bytes.length) {
      out += BASE64_CHARS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
      out += BASE64_CHARS[(bytes[i + 1] & 15) << 2];
      out += "=";
    } else {
      out += BASE64_CHARS[(bytes[i] & 3) << 4];
      out += "==";
    }
  }
  return out;
}

/** Convert UTF-8 text to bytes. */
export function utf8ToBytes(text: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
  const encoded = encodeURIComponent(text);
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i += 1) {
    if (encoded[i] === "%") {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(encoded.charCodeAt(i));
    }
  }
  return new Uint8Array(bytes);
}

/** Convert UTF-8 bytes to text. */
export function bytesToUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
  let encoded = "";
  for (let i = 0; i < bytes.length; i += 1) {
    encoded += `%${bytes[i].toString(16).padStart(2, "0")}`;
  }
  return decodeURIComponent(encoded);
}
