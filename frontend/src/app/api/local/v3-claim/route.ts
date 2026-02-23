import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

export const runtime = "nodejs";

type ClaimRole = "auto" | "traveler" | "insurer" | "both";

type ClaimRequestBody = {
  marketId?: number | string;
  who?: ClaimRole;
  previewOnly?: boolean;
};

function isLocalAddress(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost")
  );
}

function assertLocalOnly(req: NextRequest): string | null {
  const host = req.headers.get("host")?.split(":")[0];
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim().split(":")[0];
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  if (isLocalAddress(host) || isLocalAddress(forwardedHost) || isLocalAddress(forwardedFor)) {
    return null;
  }

  return "Endpoint disponible solo en localhost";
}

function resolveRepoRootFromFrontendCwd(cwd: string): string {
  const basename = path.basename(cwd);
  return basename === "frontend" ? path.resolve(cwd, "..") : cwd;
}

async function resolveClaimScriptPath(repoRoot: string): Promise<string> {
  const candidates = [
    path.join(repoRoot, "scripts", "v3-claim.sh"),
    path.join(process.cwd(), "..", "scripts", "v3-claim.sh"),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // keep searching
    }
  }

  throw new Error("No se encontró scripts/v3-claim.sh o no es ejecutable.");
}

function sanitizeMarketId(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return /^\d+$/.test(value) ? value : null;
}

function sanitizeWho(raw: unknown): ClaimRole {
  const value = String(raw ?? "both").trim().toLowerCase();
  if (value === "auto" || value === "traveler" || value === "insurer" || value === "both") {
    return value;
  }
  return "both";
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = 180_000
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Timeout ejecutando ${path.basename(command)} (${timeoutMs}ms)`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const localOnlyError = assertLocalOnly(req);
    if (localOnlyError) {
      return NextResponse.json({ success: false, error: localOnlyError }, { status: 403 });
    }

    const body = (await req.json()) as ClaimRequestBody;
    const marketId = sanitizeMarketId(body.marketId);
    if (!marketId) {
      return NextResponse.json(
        { success: false, error: "marketId inválido (entero requerido)." },
        { status: 400 }
      );
    }

    const who = sanitizeWho(body.who);
    const previewOnly = Boolean(body.previewOnly);
    const repoRoot = resolveRepoRootFromFrontendCwd(process.cwd());
    const scriptPath = await resolveClaimScriptPath(repoRoot);

    const args = [marketId, "--who", who];
    if (previewOnly) {
      args.push("--preview-only");
    }

    const result = await runCommand(scriptPath, args, repoRoot);
    const ok = result.code === 0;

    return NextResponse.json(
      {
        success: ok,
        marketId,
        who,
        previewOnly,
        command: `${scriptPath} ${args.join(" ")}`,
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
      },
      { status: ok ? 200 : 500 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error ejecutando claim local",
      },
      { status: 500 }
    );
  }
}
