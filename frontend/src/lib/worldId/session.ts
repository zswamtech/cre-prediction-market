import { isLevelAtLeast } from "./config";
import type {
  WorldIdLevel,
  WorldIdScope,
  WorldIdSessionState,
  WorldIdVerificationResult,
} from "./types";

const STORAGE_KEY = "fairlease.worldid.session.v1";
const CREATE_TTL_MS = 24 * 60 * 60 * 1000;
const CLAIM_FLIGHT_TTL_MS = 12 * 60 * 60 * 1000;

function getScopeTtlMs(scope: WorldIdScope): number {
  return scope === "create_policy" ? CREATE_TTL_MS : CLAIM_FLIGHT_TTL_MS;
}

function makeDefaultState(): WorldIdSessionState {
  return {
    version: 1,
    items: [],
  };
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function isFresh(entry: WorldIdVerificationResult, nowMs: number): boolean {
  return nowMs - entry.verifiedAt <= getScopeTtlMs(entry.scope);
}

function sanitizeState(state: WorldIdSessionState): WorldIdSessionState {
  const nowMs = Date.now();
  return {
    version: 1,
    items: state.items.filter((entry) => entry.success && isFresh(entry, nowMs)),
  };
}

export function loadWorldIdSession(): WorldIdSessionState {
  if (!canUseStorage()) return makeDefaultState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeDefaultState();

    const parsed = JSON.parse(raw) as WorldIdSessionState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) {
      return makeDefaultState();
    }

    const cleaned = sanitizeState(parsed);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    return cleaned;
  } catch {
    return makeDefaultState();
  }
}

export function saveWorldIdSession(state: WorldIdSessionState): void {
  if (!canUseStorage()) return;

  const cleaned = sanitizeState(state);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
}

export function clearWorldIdSession(): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function setWorldIdVerification(entry: WorldIdVerificationResult): void {
  const current = loadWorldIdSession();
  const withoutDuplicates = current.items.filter(
    (item) =>
      !(
        item.scope === entry.scope &&
        item.walletAddress.toLowerCase() === entry.walletAddress.toLowerCase() &&
        item.signal === entry.signal
      )
  );

  saveWorldIdSession({
    version: 1,
    items: [...withoutDuplicates, entry],
  });
}

export function getValidWorldIdVerification(params: {
  scope: WorldIdScope;
  walletAddress: string;
  signal: string;
  requiredLevel: WorldIdLevel;
  chainId?: number;
}): WorldIdVerificationResult | null {
  const wallet = params.walletAddress.toLowerCase();
  const state = loadWorldIdSession();
  const nowMs = Date.now();

  const candidates = state.items
    .filter((item) => {
      if (item.scope !== params.scope) return false;
      if (item.signal !== params.signal) return false;
      if (item.walletAddress.toLowerCase() !== wallet) return false;
      if (typeof params.chainId === "number" && item.chainId !== params.chainId) return false;
      if (!isFresh(item, nowMs)) return false;
      return isLevelAtLeast(item.level, params.requiredLevel);
    })
    .sort((a, b) => b.verifiedAt - a.verifiedAt);

  return candidates[0] || null;
}
