"use client";

import { useState } from "react";
import { parseEther } from "viem";
import { ConnectKitButton } from "connectkit";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function PredictForm({
  isConnected,
  isTest,
  marketId,
  onPredict,
  onRequestSettlement,
  isProcessing,
  isConfirming,
  isSuccess,
  writeError,
  txHash,
}: {
  isConnected: boolean;
  isTest: boolean;
  marketId: bigint;
  onPredict: (outcome: 0 | 1, value: bigint) => void;
  onRequestSettlement: () => void;
  isProcessing: boolean;
  isConfirming: boolean;
  isSuccess: boolean;
  writeError: Error | null;
  txHash: string | null;
}) {
  const [amount, setAmount] = useState("");
  const [selectedOutcome, setSelectedOutcome] = useState<0 | 1 | null>(null);

  const handlePredict = () => {
    if (!amount || selectedOutcome === null) return;
    onPredict(selectedOutcome, parseEther(amount));
    if (isSuccess) {
      setAmount("");
      setSelectedOutcome(null);
    }
  };

  return (
    <Card className="h-fit">
      <h2 className="text-lg font-semibold text-white mb-2">Aportar al pool</h2>
      <p className="text-xs text-gray-500 mb-6">
        Aportar a <span className="text-green-400">SI</span> financia el pool que paga cuando
        hay incumplimiento. Aportar a <span className="text-red-400">NO</span> financia el pool
        de &quot;sin reclamo&quot;.
      </p>

      {!isConnected && !isTest ? (
        <div className="text-center py-8">
          <p className="text-gray-400 mb-4">Conecta tu wallet para aportar</p>
          <ConnectKitButton />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Outcome selector */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setSelectedOutcome(0)}
              className={`p-4 rounded-xl border-2 transition text-lg font-bold ${
                selectedOutcome === 0
                  ? "border-green-500 bg-green-500/20 text-green-400"
                  : "border-gray-700 hover:border-green-500/50 text-gray-400"
              }`}
            >
              SI (payout)
            </button>
            <button
              onClick={() => setSelectedOutcome(1)}
              className={`p-4 rounded-xl border-2 transition text-lg font-bold ${
                selectedOutcome === 1
                  ? "border-red-500 bg-red-500/20 text-red-400"
                  : "border-gray-700 hover:border-red-500/50 text-gray-400"
              }`}
            >
              NO (sin reclamo)
            </button>
          </div>

          {/* Amount input */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Cantidad (ETH)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.01"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition"
              min="0"
              step="0.001"
            />
          </div>

          {/* Error */}
          {writeError && (
            <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg">
              {writeError.message.split("\n")[0]}
            </div>
          )}

          {/* Success */}
          {isSuccess && !isConfirming && (
            <div className="text-green-400 text-sm bg-green-900/20 p-3 rounded-lg">
              Transaccion confirmada!
            </div>
          )}

          {/* Submit */}
          <Button
            variant="primary"
            className="w-full py-4"
            onClick={handlePredict}
            disabled={!amount || selectedOutcome === null || isProcessing || isConfirming}
            loading={isProcessing || isConfirming}
          >
            Enviar aporte
          </Button>

          {/* Settlement */}
          <div className="pt-6 border-t border-gray-700 mt-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Liquidacion</h3>
            <Button
              variant="secondary"
              className="w-full"
              onClick={onRequestSettlement}
              disabled={isProcessing || isConfirming}
              data-testid="ai-settlement-button"
            >
              <span className="flex items-center justify-center gap-2">
                <span>🤖</span> Solicitar liquidacion de IA
              </span>
            </Button>
            {txHash && (
              <div className="mt-2 text-xs bg-black/40 p-2 rounded border border-blue-500/30 text-blue-200 break-all">
                <p className="font-bold text-blue-400 mb-1">TX Hash:</p>
                {txHash}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-2 text-center">
              Activa el workflow CRE + Gemini para resolver la poliza.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
