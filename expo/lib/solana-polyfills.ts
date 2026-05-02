import * as Crypto from "expo-crypto";
import nacl from "tweetnacl";

type CryptoLike = {
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
};

const root = globalThis as typeof globalThis & { crypto?: CryptoLike };
const cryptoLike: CryptoLike = root.crypto ?? {};
root.crypto = cryptoLike as typeof globalThis.crypto & CryptoLike;

if (typeof cryptoLike.getRandomValues !== "function") {
  cryptoLike.getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
    if (!array) return array;
    const view = array as ArrayBufferView;
    const bytes = Crypto.getRandomBytes(view.byteLength);
    new Uint8Array(view.buffer, view.byteOffset, view.byteLength).set(bytes);
    return array;
  };
}

nacl.setPRNG((x: Uint8Array, n: number): void => {
  x.set(Crypto.getRandomBytes(n));
});
