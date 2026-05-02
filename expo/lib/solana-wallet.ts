import "@/lib/solana-polyfills";

import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { HDKey } from "micro-ed25519-hdkey";
import bs58 from "bs58";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import nacl from "tweetnacl";

import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from "@/lib/encoding";
import { rpcCall } from "@/lib/api/jupiter";

export type TradingWalletType = "local" | "phantom";

export interface TradingWalletSecret {
  version: 1;
  address: string;
  secretKeyBase58: string;
  mnemonic?: string;
  createdAt: number;
}

export interface PhantomConnectionSecret {
  version: 1;
  publicKey: string;
  session: string;
  dappSecretKeyBase58: string;
  dappPublicKeyBase58: string;
  phantomEncryptionPublicKey: string;
  sharedSecretBase58: string;
  connectedAt: number;
}

export interface PhantomConnectResult {
  publicKey: string;
  session: string;
}

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const PHANTOM_BASE = "https://phantom.app/ul/v1";
const PHANTOM_APP_URL = "https://rork.app";

function secureWalletKey(userId: string, walletId: string): string {
  return `soltools.wallet.secret.v1.${userId}.${walletId}`;
}

function phantomKey(userId: string): string {
  return `soltools.phantom.v1.${userId}`;
}

async function setSecure(key: string, value: string): Promise<void> {
  if (await SecureStore.isAvailableAsync()) {
    await SecureStore.setItemAsync(key, value, SECURE_OPTIONS);
    return;
  }
  throw new Error("Secure device storage is not available on this platform.");
}

async function getSecure(key: string): Promise<string | null> {
  if (await SecureStore.isAvailableAsync()) {
    return SecureStore.getItemAsync(key, SECURE_OPTIONS);
  }
  return null;
}

async function deleteSecure(key: string): Promise<void> {
  if (await SecureStore.isAvailableAsync()) {
    await SecureStore.deleteItemAsync(key, SECURE_OPTIONS);
  }
}

function keypairFromMnemonic(mnemonic: string): Keypair {
  const seed = mnemonicToSeedSync(mnemonic.trim());
  const derived = HDKey.fromMasterSeed(seed).derive("m/44'/501'/0'/0'");
  if (!derived.privateKey) throw new Error("Could not derive Solana wallet.");
  return Keypair.fromSeed(derived.privateKey);
}

function keypairFromSecret(input: string): Keypair {
  const trimmed = input.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as number[];
    return Keypair.fromSecretKey(new Uint8Array(parsed));
  }
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

export function shortAddress(address: string): string {
  return address ? `${address.slice(0, 4)}…${address.slice(-4)}` : "—";
}

export function isMnemonic(value: string): boolean {
  return validateMnemonic(value.trim().toLowerCase(), wordlist);
}

/** Create a fresh BIP39 Solana wallet and return the secret object for device-only storage. */
export function createFreshSolanaWallet(): TradingWalletSecret {
  const mnemonic = generateMnemonic(wordlist, 128);
  const kp = keypairFromMnemonic(mnemonic);
  return {
    version: 1,
    address: kp.publicKey.toBase58(),
    secretKeyBase58: bs58.encode(kp.secretKey),
    mnemonic,
    createdAt: Date.now(),
  };
}

/** Import a Solana wallet from a mnemonic, base58 private key, or JSON secret-key array. */
export function importSolanaWalletSecret(value: string): TradingWalletSecret {
  const trimmed = value.trim();
  const kp = isMnemonic(trimmed) ? keypairFromMnemonic(trimmed.toLowerCase()) : keypairFromSecret(trimmed);
  return {
    version: 1,
    address: kp.publicKey.toBase58(),
    secretKeyBase58: bs58.encode(kp.secretKey),
    mnemonic: isMnemonic(trimmed) ? trimmed.toLowerCase() : undefined,
    createdAt: Date.now(),
  };
}

export async function saveLocalWalletSecret(userId: string, walletId: string, secret: TradingWalletSecret): Promise<void> {
  await setSecure(secureWalletKey(userId, walletId), JSON.stringify(secret));
}

export async function readLocalWalletSecret(userId: string, walletId: string): Promise<TradingWalletSecret | null> {
  const raw = await getSecure(secureWalletKey(userId, walletId));
  if (!raw) return null;
  return JSON.parse(raw) as TradingWalletSecret;
}

export async function deleteLocalWalletSecret(userId: string, walletId: string): Promise<void> {
  await deleteSecure(secureWalletKey(userId, walletId));
}

export async function savePhantomConnection(userId: string, secret: PhantomConnectionSecret): Promise<void> {
  await setSecure(phantomKey(userId), JSON.stringify(secret));
}

export async function readPhantomConnection(userId: string): Promise<PhantomConnectionSecret | null> {
  const raw = await getSecure(phantomKey(userId));
  if (!raw) return null;
  return JSON.parse(raw) as PhantomConnectionSecret;
}

export async function deletePhantomConnection(userId: string): Promise<void> {
  await deleteSecure(phantomKey(userId));
}

function decryptPayload<T>(data: string, nonce: string, sharedSecret: Uint8Array): T {
  const decrypted = nacl.box.open.after(bs58.decode(data), bs58.decode(nonce), sharedSecret);
  if (!decrypted) throw new Error("Could not decrypt Phantom response.");
  return JSON.parse(bytesToUtf8(decrypted)) as T;
}

function encryptPayload(payload: Record<string, unknown>, sharedSecret: Uint8Array): { nonce: string; payload: string } {
  const nonceBytes = nacl.randomBytes(24);
  const encrypted = nacl.box.after(utf8ToBytes(JSON.stringify(payload)), nonceBytes, sharedSecret);
  return { nonce: bs58.encode(nonceBytes), payload: bs58.encode(encrypted) };
}

function urlParams(url: string): URLSearchParams {
  const q = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  return new URLSearchParams(q);
}

export function parsePhantomConnectUrl(url: string, dappSecretKeyBase58: string): PhantomConnectionSecret {
  const params = urlParams(url);
  const error = params.get("errorMessage") ?? params.get("errorCode");
  if (error) throw new Error(error);
  const phantomEncryptionPublicKey = params.get("phantom_encryption_public_key") ?? "";
  const nonce = params.get("nonce") ?? "";
  const data = params.get("data") ?? "";
  if (!phantomEncryptionPublicKey || !nonce || !data) throw new Error("Missing Phantom connect response.");
  const dappSecretKey = bs58.decode(dappSecretKeyBase58);
  const sharedSecret = nacl.box.before(bs58.decode(phantomEncryptionPublicKey), dappSecretKey);
  const decoded = decryptPayload<{ public_key: string; session: string }>(data, nonce, sharedSecret);
  const keyPairPublic = nacl.box.keyPair.fromSecretKey(dappSecretKey).publicKey;
  return {
    version: 1,
    publicKey: decoded.public_key,
    session: decoded.session,
    dappSecretKeyBase58,
    dappPublicKeyBase58: bs58.encode(keyPairPublic),
    phantomEncryptionPublicKey,
    sharedSecretBase58: bs58.encode(sharedSecret),
    connectedAt: Date.now(),
  };
}

export function parsePhantomSignatureUrl(url: string, connection: PhantomConnectionSecret): string {
  const params = urlParams(url);
  const error = params.get("errorMessage") ?? params.get("errorCode");
  if (error) throw new Error(error);
  const nonce = params.get("nonce") ?? "";
  const data = params.get("data") ?? "";
  if (!nonce || !data) throw new Error("Missing Phantom signature response.");
  const decoded = decryptPayload<{ signature?: string; hash?: string }>(data, nonce, bs58.decode(connection.sharedSecretBase58));
  const sig = decoded.signature ?? decoded.hash;
  if (!sig) throw new Error("Phantom did not return a transaction signature.");
  return sig;
}

export function buildPhantomConnectUrl(dappPublicKeyBase58: string): string {
  const params = new URLSearchParams({
    app_url: PHANTOM_APP_URL,
    dapp_encryption_public_key: dappPublicKeyBase58,
    redirect_link: Linking.createURL("wallet/phantom-connect"),
    cluster: "mainnet-beta",
  });
  return `${PHANTOM_BASE}/connect?${params.toString()}`;
}

export function buildPhantomSignAndSendUrl(connection: PhantomConnectionSecret, transactionBytes: Uint8Array): string {
  const encrypted = encryptPayload(
    {
      session: connection.session,
      transaction: bs58.encode(transactionBytes),
    },
    bs58.decode(connection.sharedSecretBase58),
  );
  const params = new URLSearchParams({
    dapp_encryption_public_key: connection.dappPublicKeyBase58,
    nonce: encrypted.nonce,
    redirect_link: Linking.createURL("wallet/phantom-trade"),
    payload: encrypted.payload,
  });
  return `${PHANTOM_BASE}/signAndSendTransaction?${params.toString()}`;
}

export function createPhantomDappKeypair(): { publicKeyBase58: string; secretKeyBase58: string } {
  const pair = nacl.box.keyPair();
  return {
    publicKeyBase58: bs58.encode(pair.publicKey),
    secretKeyBase58: bs58.encode(pair.secretKey),
  };
}

async function waitForSignature(signature: string, maxMs: number = 35_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await rpcCall<{ value: Array<{ confirmationStatus?: string; err?: unknown } | null> }>(
        "getSignatureStatuses",
        [[signature], { searchTransactionHistory: true }],
      );
      const status = res.value?.[0];
      if (status?.err) return false;
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return true;
    } catch (e) {
      console.log("[wallet] signature poll failed", e);
    }
    await new Promise((resolve) => setTimeout(resolve, 1800));
  }
  return false;
}

async function sendSignedTransactionBase64(signedBase64: string): Promise<string> {
  return rpcCall<string>("sendTransaction", [
    signedBase64,
    { encoding: "base64", skipPreflight: false, maxRetries: 3 },
  ]);
}

export async function signAndSendLocalSwap(params: {
  userId: string;
  walletId: string;
  swapTransactionBase64: string;
  onStatus?: (status: string) => void;
}): Promise<string> {
  const secret = await readLocalWalletSecret(params.userId, params.walletId);
  if (!secret) throw new Error("This wallet's private key is not on this device.");
  const kp = keypairFromSecret(secret.secretKeyBase58);
  const txBytes = base64ToBytes(params.swapTransactionBase64);
  const transaction = VersionedTransaction.deserialize(txBytes);
  transaction.sign([kp]);
  params.onStatus?.("Broadcasting signed transaction…");
  return sendSignedTransactionBase64(bytesToBase64(transaction.serialize()));
}

export async function confirmSignature(signature: string): Promise<boolean> {
  return waitForSignature(signature);
}
