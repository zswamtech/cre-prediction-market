export type WorldIdLevel = "device" | "orb";

export type WorldIdScope = "create_policy" | "claim_flight";

export type WorldIdProofPayload = {
  proof: string;
  nullifier_hash: string;
  merkle_root: string;
  verification_level: WorldIdLevel;
  action: string;
  signal: string;
};

export type WorldIdVerificationResult = {
  success: boolean;
  level: WorldIdLevel;
  nullifierHash: string;
  scope: WorldIdScope;
  signal: string;
  verifiedAt: number;
  walletAddress: string;
  chainId?: number;
  bypass?: boolean;
  error?: string;
};

export type WorldIdSessionState = {
  version: 1;
  items: WorldIdVerificationResult[];
};

export type WorldIdClientRequest = {
  scope: WorldIdScope;
  action: string;
  signal: string;
  minLevel: WorldIdLevel;
  appId: string;
};

export type WorldIdClientSuccess = {
  ok: true;
  payload: WorldIdProofPayload;
  provider: "minikit" | "idkit";
};

export type WorldIdClientFailure = {
  ok: false;
  code:
    | "user_cancelled"
    | "unsupported_env"
    | "missing_config"
    | "proof_failed"
    | "unknown_error";
  message: string;
};

export type WorldIdClientResult = WorldIdClientSuccess | WorldIdClientFailure;
