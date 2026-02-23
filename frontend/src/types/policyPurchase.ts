/**
 * policyPurchase.ts
 *
 * Offchain draft structure for a parametric insurance purchase.
 * Stored in localStorage; never sent to any server in V1.
 *
 * IMPORTANT: pnrHash must be SHA-256 of the PNR. Never store the plain PNR.
 */

export interface PolicyPurchaseDraft {
  /** Schema version for future migrations */
  version: 1;
  policyType: "flight" | "property";

  // Flight fields
  flightCode?: string;
  travelDate?: string;
  delayThresholdMinutes?: number;

  // Property fields
  propertyId?: string;

  // Offchain underwriting fields (not recorded onchain in V1)
  ticketPriceUsd?: number;
  /** SHA-256 of the PNR — never store the plain PNR text */
  pnrHash?: string;
  /** Suggested = ticketPriceUsd * 0.5 (Tier 1, 50% payout) */
  payoutCapUsd?: number;
  /** Coverage capital target for Tier 2 payout in demo (ETH) */
  coverageCapEth?: number;
  /** Premium percentage over coverage cap (e.g. 15) */
  premiumRatePct?: number;
  /** Suggested premium in ETH = coverageCapEth * premiumRatePct / 100 */
  suggestedPremiumEth?: number;

  // The resolved binary question (for reference)
  question?: string;

  // Connected wallet at time of draft
  wallet?: string;

  savedAt?: string;
}

export const POLICY_DRAFT_KEY = "fairlease_policy_draft_v1";

export function loadPolicyDraft(): PolicyPurchaseDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(POLICY_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1) return null;
    return parsed as PolicyPurchaseDraft;
  } catch {
    return null;
  }
}

export function savePolicyDraft(draft: PolicyPurchaseDraft): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(POLICY_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearPolicyDraft(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(POLICY_DRAFT_KEY);
  } catch {
    // ignore
  }
}
