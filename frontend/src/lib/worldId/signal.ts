function toHex(buffer: ArrayBuffer): string {
  const bytes = Array.from(new Uint8Array(buffer));
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeWalletAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeFlightCode(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function normalizeTravelDate(value: string): string {
  return value.trim();
}

export function normalizePnr(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(input);

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("crypto_subtle_unavailable");
  }

  const hash = await subtle.digest("SHA-256", encoded);
  return toHex(hash);
}

export async function computePnrHash(pnrRaw: string): Promise<string> {
  const normalized = normalizePnr(pnrRaw);
  if (!normalized) return "";
  return sha256Hex(normalized);
}

export async function buildCreateSignal(walletAddress: string): Promise<string> {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  return sha256Hex(`create|${normalizedWallet}`);
}

export async function buildClaimFlightSignal(params: {
  walletAddress: string;
  flightCode: string;
  travelDate: string;
  pnrHash?: string;
}): Promise<string> {
  const wallet = normalizeWalletAddress(params.walletAddress);
  const flightCode = normalizeFlightCode(params.flightCode);
  const travelDate = normalizeTravelDate(params.travelDate);
  const pnrHash = (params.pnrHash || "").trim().toLowerCase();
  return sha256Hex(`claim|${flightCode}|${travelDate}|${wallet}|${pnrHash}`);
}

export function buildFlightScopeKey(flightCode: string, travelDate: string): string {
  return `${normalizeFlightCode(flightCode)}|${normalizeTravelDate(travelDate)}`;
}
