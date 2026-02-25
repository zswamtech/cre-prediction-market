import { keccak256, toHex } from "viem";
import { privateKeyToAddress } from "viem/accounts";

export const PRIVATE_PAYOUT_TAG = "[FF_PRIVATE_PAYOUT]";

export type StealthPreview = {
  stealthAddress: `0x${string}`;
  commitmentHint: `0x${string}`;
  generatedAt: number;
};

const bytesToHexString = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

const randomPrivateKey = (): `0x${string}` => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${bytesToHexString(bytes)}`;
};

export function hasPrivatePayoutTag(question: string): boolean {
  return question.includes(PRIVATE_PAYOUT_TAG);
}

export function stripPrivatePayoutTag(question: string): string {
  return question
    .split(PRIVATE_PAYOUT_TAG)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function withPrivatePayoutTag(question: string, enabled: boolean): string {
  const clean = stripPrivatePayoutTag(question);
  if (!enabled) return clean;
  if (!clean) return PRIVATE_PAYOUT_TAG;
  return `${clean} ${PRIVATE_PAYOUT_TAG}`;
}

export function deriveStealthPreview(seed?: string): StealthPreview {
  const privateKey = randomPrivateKey();
  const stealthAddress = privateKeyToAddress(privateKey);
  const entropy = seed?.trim() || `${stealthAddress}:${Date.now()}:${Math.random()}`;
  const commitmentHint = keccak256(toHex(entropy));
  return {
    stealthAddress,
    commitmentHint,
    generatedAt: Date.now(),
  };
}
