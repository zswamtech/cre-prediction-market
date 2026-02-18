export type TxUiState =
  | "idle"
  | "awaiting_signature"
  | "broadcasted"
  | "pending_tenderly"
  | "confirmed"
  | "rpc_mismatch"
  | "timeout"
  | "error";

export const DEFAULT_TX_WARN_AFTER_MS = 25000;
export const DEFAULT_TX_CONFIRM_TIMEOUT_MS = 90000;

export type TxStatusPresentation = {
  tone: "info" | "warning" | "success" | "error";
  message: string;
};

type TxStatusOptions = {
  networkLabel?: string;
  tenderlyStrict?: boolean;
};

export function parseTxMsFromEnv(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function getTxStatusPresentation(
  state: TxUiState,
  options?: TxStatusOptions
): TxStatusPresentation | null {
  const networkLabel = options?.networkLabel || "RPC";
  const tenderlyStrict = options?.tenderlyStrict === true;

  switch (state) {
    case "idle":
      return null;
    case "awaiting_signature":
      return {
        tone: "info",
        message: "Esperando firma en tu wallet...",
      };
    case "broadcasted":
      return {
        tone: "info",
        message: `Tx enviada. Verificando visibilidad en ${networkLabel}...`,
      };
    case "pending_tenderly":
      return {
        tone: "info",
        message: `Tx visible en ${networkLabel}. Esperando confirmación...`,
      };
    case "confirmed":
      return {
        tone: "success",
        message: `Tx confirmada en ${networkLabel}.`,
      };
    case "rpc_mismatch":
      return {
        tone: "warning",
        message: tenderlyStrict
          ? "Tx firmada pero no visible en Tenderly. MetaMask probablemente usa otro RPC de Sepolia."
          : `Tx firmada pero no visible en ${networkLabel}. Verifica el RPC activo en MetaMask y reintenta.`,
      };
    case "timeout":
      return {
        tone: "warning",
        message:
          "La tx no confirmó dentro del tiempo esperado. Puedes reintentar la verificación.",
      };
    case "error":
      return {
        tone: "error",
        message: tenderlyStrict
          ? "No se pudo confirmar la tx desde el frontend. Revisa red/RPC y reintenta la verificación."
          : `No se pudo confirmar la tx desde el frontend usando ${networkLabel}. Revisa red/RPC y reintenta.`,
      };
    default:
      return null;
  }
}

export function isRetryableTxState(state: TxUiState): boolean {
  return state === "rpc_mismatch" || state === "timeout" || state === "error";
}
