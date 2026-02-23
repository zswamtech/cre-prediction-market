import { NextRequest, NextResponse } from "next/server";
import {
  getRequiredLevel,
  getVerifierBaseUrl,
  getWorldIdAction,
  getWorldIdAppId,
  getWorldIdDevBypassEnabled,
  hasWorldIdCriticalConfig,
  isLevelAtLeast,
} from "@/lib/worldId/config";
import type { WorldIdLevel, WorldIdProofPayload, WorldIdScope } from "@/lib/worldId/types";

type VerifyRequestBody = {
  scope?: WorldIdScope;
  proofPayload?: Partial<WorldIdProofPayload>;
  walletAddress?: string;
  flightContext?: {
    flightCode?: string;
    travelDate?: string;
  };
};

function parseLevel(value: unknown): WorldIdLevel | null {
  if (value === "device") return "device";
  if (value === "orb") return "orb";
  return null;
}

export async function POST(request: NextRequest) {
  let body: VerifyRequestBody;

  try {
    body = (await request.json()) as VerifyRequestBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        reason: "invalid_json",
      },
      { status: 400 }
    );
  }

  const scope = body.scope;
  if (scope !== "create_policy" && scope !== "claim_flight") {
    return NextResponse.json(
      {
        success: false,
        reason: "invalid_scope",
      },
      { status: 400 }
    );
  }

  if (!hasWorldIdCriticalConfig(scope)) {
    return NextResponse.json(
      {
        success: false,
        reason: "world_id_not_configured",
      },
      { status: 400 }
    );
  }

  const walletAddress = body.walletAddress;
  if (
    typeof walletAddress !== "string" ||
    !/^0x[a-fA-F0-9]{40}$/.test(walletAddress.trim())
  ) {
    return NextResponse.json(
      {
        success: false,
        reason: "invalid_wallet_address",
      },
      { status: 400 }
    );
  }

  const expectedAction = getWorldIdAction(scope);
  const requiredLevel = getRequiredLevel(scope);
  const appId = getWorldIdAppId();

  if (!appId || !expectedAction) {
    return NextResponse.json(
      {
        success: false,
        reason: "missing_world_id_config",
      },
      { status: 400 }
    );
  }

  const payload = body.proofPayload || {};
  const verificationLevel = parseLevel(payload.verification_level);

  if (
    typeof payload.proof !== "string" ||
    typeof payload.nullifier_hash !== "string" ||
    typeof payload.merkle_root !== "string" ||
    typeof payload.signal !== "string" ||
    typeof payload.action !== "string" ||
    !verificationLevel
  ) {
    return NextResponse.json(
      {
        success: false,
        reason: "invalid_proof_payload",
      },
      { status: 400 }
    );
  }

  if (payload.action !== expectedAction) {
    return NextResponse.json(
      {
        success: false,
        reason: "action_mismatch",
      },
      { status: 400 }
    );
  }

  if (!payload.signal.trim()) {
    return NextResponse.json(
      {
        success: false,
        reason: "missing_signal",
      },
      { status: 400 }
    );
  }

  if (getWorldIdDevBypassEnabled()) {
    return NextResponse.json({
      success: true,
      acceptedLevel: requiredLevel,
      nullifierHash: payload.nullifier_hash,
      scope,
      reason: "bypass",
      bypass: true,
    });
  }

  const verifyUrl = `${getVerifierBaseUrl()}/${appId}`;

  let worldResponse: Response;
  try {
    worldResponse = await fetch(verifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        proof: payload.proof,
        nullifier_hash: payload.nullifier_hash,
        merkle_root: payload.merkle_root,
        verification_level: verificationLevel,
        action: payload.action,
        signal: payload.signal,
      }),
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        reason: "verify_endpoint_unreachable",
      },
      { status: 502 }
    );
  }

  let worldJson: Record<string, unknown> = {};
  try {
    worldJson = (await worldResponse.json()) as Record<string, unknown>;
  } catch {
    // ignore and handle below
  }

  if (!worldResponse.ok || worldJson.success !== true) {
    return NextResponse.json(
      {
        success: false,
        scope,
        reason:
          typeof worldJson.detail === "string"
            ? worldJson.detail
            : typeof worldJson.code === "string"
              ? worldJson.code
              : "proof_rejected",
      },
      { status: 400 }
    );
  }

  const acceptedLevel = parseLevel(worldJson.verification_level) || verificationLevel;

  if (!isLevelAtLeast(acceptedLevel, requiredLevel)) {
    return NextResponse.json(
      {
        success: false,
        scope,
        reason: "insufficient_verification_level",
      },
      { status: 403 }
    );
  }

  return NextResponse.json({
    success: true,
    acceptedLevel,
    nullifierHash: payload.nullifier_hash,
    scope,
    reason: "verified",
  });
}
