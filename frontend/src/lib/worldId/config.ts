import type { WorldIdLevel, WorldIdScope } from "./types";

const WORLD_ID_ENABLED = process.env.NEXT_PUBLIC_WORLD_ID_ENABLED === "1";
const WORLD_ID_APP_ID = process.env.NEXT_PUBLIC_WORLD_ID_APP_ID || "";

const ACTIONS: Record<WorldIdScope, string> = {
  create_policy: process.env.NEXT_PUBLIC_WORLD_ID_ACTION_CREATE || "",
  claim_flight: process.env.NEXT_PUBLIC_WORLD_ID_ACTION_CLAIM || "",
};

const REQUIRED_LEVELS: Record<WorldIdScope, WorldIdLevel> = {
  create_policy:
    process.env.NEXT_PUBLIC_WORLD_ID_CREATE_MIN_LEVEL === "orb" ? "orb" : "device",
  claim_flight:
    process.env.NEXT_PUBLIC_WORLD_ID_CLAIM_MIN_LEVEL === "device" ? "device" : "orb",
};

const DEFAULT_VERIFY_ENDPOINT = "https://developer.worldcoin.org/api/v2/verify";

export function isWorldIdEnabled(): boolean {
  return WORLD_ID_ENABLED;
}

export function getWorldIdAppId(): string {
  return WORLD_ID_APP_ID;
}

export function getWorldIdAction(scope: WorldIdScope): string {
  return ACTIONS[scope] || "";
}

export function getRequiredLevel(scope: WorldIdScope): WorldIdLevel {
  return REQUIRED_LEVELS[scope];
}

export function getVerifierBaseUrl(): string {
  const envValue = process.env.WORLD_ID_VERIFY_ENDPOINT;
  if (!envValue) return DEFAULT_VERIFY_ENDPOINT;
  return envValue.replace(/\/$/, "");
}

export function getWorldIdConfigIssues(scope: WorldIdScope): string[] {
  const issues: string[] = [];
  if (!WORLD_ID_ENABLED) {
    issues.push("NEXT_PUBLIC_WORLD_ID_ENABLED != 1");
    return issues;
  }
  if (!WORLD_ID_APP_ID) {
    issues.push("NEXT_PUBLIC_WORLD_ID_APP_ID missing");
  }
  if (!ACTIONS[scope]) {
    issues.push(
      scope === "create_policy"
        ? "NEXT_PUBLIC_WORLD_ID_ACTION_CREATE missing"
        : "NEXT_PUBLIC_WORLD_ID_ACTION_CLAIM missing"
    );
  }
  return issues;
}

export function hasWorldIdCriticalConfig(scope: WorldIdScope): boolean {
  return isWorldIdEnabled() && getWorldIdConfigIssues(scope).length === 0;
}

export function getWorldIdDevBypassEnabled(): boolean {
  return process.env.WORLD_ID_DEV_BYPASS === "1";
}

export function isLevelAtLeast(actual: WorldIdLevel, required: WorldIdLevel): boolean {
  if (required === "device") return actual === "device" || actual === "orb";
  return actual === "orb";
}
