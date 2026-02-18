import type {
  WorldIdClientRequest,
  WorldIdClientResult,
  WorldIdClientFailure,
  WorldIdLevel,
  WorldIdProofPayload,
} from "./types";

function parseLevel(value: unknown, fallback: WorldIdLevel): WorldIdLevel {
  if (value === "orb") return "orb";
  if (value === "device") return "device";
  return fallback;
}

function toProofPayload(value: unknown, fallback: {
  action: string;
  signal: string;
  minLevel: WorldIdLevel;
}): WorldIdProofPayload | null {
  if (!value || typeof value !== "object") return null;
  const maybe = value as Record<string, unknown>;

  const proof = typeof maybe.proof === "string" ? maybe.proof : "";
  const nullifierHash =
    typeof maybe.nullifier_hash === "string" ? maybe.nullifier_hash : "";
  const merkleRoot = typeof maybe.merkle_root === "string" ? maybe.merkle_root : "";

  if (!proof || !nullifierHash || !merkleRoot) {
    return null;
  }

  return {
    proof,
    nullifier_hash: nullifierHash,
    merkle_root: merkleRoot,
    verification_level: parseLevel(maybe.verification_level, fallback.minLevel),
    action:
      typeof maybe.action === "string" && maybe.action
        ? maybe.action
        : fallback.action,
    signal:
      typeof maybe.signal === "string" && maybe.signal
        ? maybe.signal
        : fallback.signal,
  };
}

function normalizeSdkResult(
  sdkResult: unknown,
  fallback: {
    action: string;
    signal: string;
    minLevel: WorldIdLevel;
  }
): WorldIdProofPayload | null {
  if (!sdkResult || typeof sdkResult !== "object") return null;

  const direct = toProofPayload(sdkResult, fallback);
  if (direct) return direct;

  const record = sdkResult as Record<string, unknown>;
  const nestedCandidates = [
    record.finalPayload,
    record.payload,
    record.result,
    record.proof,
    record.proofResult,
  ];

  for (const nested of nestedCandidates) {
    const parsed = toProofPayload(nested, fallback);
    if (parsed) return parsed;
  }

  return null;
}

type ProviderAttempt = {
  payload: WorldIdProofPayload | null;
  error?: unknown;
};

function toFailureFromError(error: unknown): WorldIdClientFailure {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "No se pudo completar la verificación World ID.";

  if (/cancel|denied|rejected|abort|closed/i.test(message)) {
    return {
      ok: false,
      code: "user_cancelled",
      message: "Verificación cancelada por el usuario.",
    };
  }

  if (/proof|verify|verification|invalid/i.test(message)) {
    return {
      ok: false,
      code: "proof_failed",
      message: "La prueba de World ID no fue aceptada.",
    };
  }

  return {
    ok: false,
    code: "unknown_error",
    message,
  };
}

async function requestViaMiniKit(request: WorldIdClientRequest): Promise<ProviderAttempt> {
  try {
    const miniKitModuleName = "@worldcoin/minikit-js";
    const miniKitModule = (await import(miniKitModuleName)) as Record<string, unknown>;
    const miniKit = miniKitModule?.MiniKit as Record<string, unknown> | undefined;
    if (!miniKit) return { payload: null };

    const isInstalled =
      typeof miniKit.isInstalled === "function" ? (miniKit.isInstalled as () => boolean)() : false;
    if (!isInstalled) return { payload: null };

    const commandsAsync = miniKit.commandsAsync as Record<string, unknown> | undefined;
    const verifyFn =
      commandsAsync && typeof commandsAsync.verify === "function"
        ? (commandsAsync.verify as (args: unknown) => Promise<unknown>)
        : null;

    if (!verifyFn) {
      return { payload: null };
    }

    const response = await verifyFn({
      action: request.action,
      signal: request.signal,
      verification_level: request.minLevel,
    });

    return {
      payload: normalizeSdkResult(response, {
        action: request.action,
        signal: request.signal,
        minLevel: request.minLevel,
      }),
    };
  } catch (error) {
    return {
      payload: null,
      error,
    };
  }
}

async function requestViaIdKit(request: WorldIdClientRequest): Promise<ProviderAttempt> {
  try {
    const idKitModuleName = "@worldcoin/idkit";
    const idKitModule = (await import(idKitModuleName)) as Record<string, unknown>;
    const IDKitSession = idKitModule?.IDKitSession as
      | (new (config: Record<string, unknown>) => { start: () => Promise<unknown> })
      | undefined;

    if (!IDKitSession) return { payload: null };

    const session = new IDKitSession({
      app_id: request.appId,
      action: request.action,
      signal: request.signal,
      verification_level: request.minLevel,
    });

    const response = await session.start();

    return {
      payload: normalizeSdkResult(response, {
        action: request.action,
        signal: request.signal,
        minLevel: request.minLevel,
      }),
    };
  } catch (error) {
    return {
      payload: null,
      error,
    };
  }
}

export async function requestWorldIdProof(
  request: WorldIdClientRequest
): Promise<WorldIdClientResult> {
  if (!request.appId || !request.action || !request.signal) {
    return {
      ok: false,
      code: "missing_config",
      message: "World ID no está configurado correctamente.",
    };
  }

  const miniKitAttempt = await requestViaMiniKit(request);
  if (miniKitAttempt.payload) {
    return {
      ok: true,
      payload: miniKitAttempt.payload,
      provider: "minikit",
    };
  }
  if (miniKitAttempt.error) {
    const failure = toFailureFromError(miniKitAttempt.error);
    if (failure.code === "user_cancelled") return failure;
  }

  const idKitAttempt = await requestViaIdKit(request);
  if (idKitAttempt.payload) {
    return {
      ok: true,
      payload: idKitAttempt.payload,
      provider: "idkit",
    };
  }
  if (idKitAttempt.error) {
    return toFailureFromError(idKitAttempt.error);
  }

  if (miniKitAttempt.error) {
    return toFailureFromError(miniKitAttempt.error);
  }

  return {
    ok: false,
    code: "unsupported_env",
    message:
      "No se pudo iniciar verificación World ID en este entorno. Usa World App o habilita IDKit en navegador.",
  };
}
