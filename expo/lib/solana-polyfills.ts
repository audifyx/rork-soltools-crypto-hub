import * as Crypto from "expo-crypto";
import nacl from "tweetnacl";

type CryptoLike = {
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
};

const root = globalThis as typeof globalThis & { crypto?: CryptoLike };

const getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
  if (!array) return array;
  const view = array as ArrayBufferView;
  const bytes = Crypto.getRandomBytes(view.byteLength);
  new Uint8Array(view.buffer, view.byteOffset, view.byteLength).set(bytes);
  return array;
};

if (!root.crypto) {
  Object.defineProperty(root, "crypto", {
    value: { getRandomValues },
    configurable: true,
    writable: true,
  });
} else if (typeof root.crypto.getRandomValues !== "function") {
  Object.defineProperty(root.crypto, "getRandomValues", {
    value: getRandomValues,
    configurable: true,
    writable: true,
  });
}

nacl.setPRNG((x: Uint8Array, n: number): void => {
  x.set(Crypto.getRandomBytes(n));
});
