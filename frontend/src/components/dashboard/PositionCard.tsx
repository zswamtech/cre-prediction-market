import Link from "next/link";
import { formatEther } from "viem";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { Position } from "@/hooks/useUserPositions";

const statusBadge: Record<Position["status"], { variant: "active" | "settled" | "claimed" | "error" | "pending"; label: string }> = {
  active: { variant: "active", label: "Activa" },
  claimable: { variant: "settled", label: "Por reclamar" },
  claimed: { variant: "claimed", label: "Reclamada" },
  lost: { variant: "error", label: "Perdida" },
};

export function PositionCard({
  position,
  onClaim,
  claiming,
}: {
  position: Position;
  onClaim: (marketId: number) => void;
  claiming: boolean;
}) {
  const { variant, label } = statusBadge[position.status];
  const icon = /\b(vuelo|flight|delay|retras|cancelad|cancelled)\b/i.test(position.question) ? "✈️" : "🏠";

  return (
    <Card hover className="flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant="info">#{position.marketId}</Badge>
            <span>{icon}</span>
          </div>
          <Badge variant={variant}>{label}</Badge>
        </div>

        <Link href={`/market/${position.marketId}`}>
          <h3 className="text-sm font-medium text-white hover:text-purple-400 transition line-clamp-2 mb-3">
            {position.question}
          </h3>
        </Link>

        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div className="bg-gray-900/50 rounded-lg p-2">
            <p className="text-gray-500">Tu posicion</p>
            <p className={position.side === 0 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
              {position.side === 0 ? "SI" : "NO"}
            </p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-2">
            <p className="text-gray-500">Stake</p>
            <p className="text-white font-mono">{formatEther(position.amount)} ETH</p>
          </div>
          {position.settled && (
            <>
              <div className="bg-gray-900/50 rounded-lg p-2">
                <p className="text-gray-500">Resultado</p>
                <p className={position.outcome === 0 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
                  {position.outcome === 0 ? "SI" : "NO"}
                </p>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-2">
                <p className="text-gray-500">Payout</p>
                <p className={position.isWinner ? "text-green-400 font-mono" : "text-gray-500 font-mono"}>
                  {position.isWinner ? `${formatEther(position.payout)} ETH` : "—"}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {position.status === "claimable" && (
        <Button
          variant="success"
          size="sm"
          className="w-full"
          loading={claiming}
          onClick={() => onClaim(position.marketId)}
        >
          Reclamar payout
        </Button>
      )}
    </Card>
  );
}
