import Link from "next/link";
import { formatEther } from "viem";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { Position } from "@/hooks/useUserPositions";

const statusBadge: Record<Position["status"], { variant: "active" | "settled" | "claimed" | "error" | "pending"; label: string }> = {
  created: { variant: "pending", label: "Creada" },
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
  onClaim: (position: Position) => void;
  claiming: boolean;
}) {
  const { variant, label } = statusBadge[position.status];
  const icon = /\b(vuelo|flight|delay|retras|cancelad|cancelled)\b/i.test(position.question) ? "✈️" : "🏠";
  const marketHref = position.version === "v3" ? `/market/${position.marketId}?v=3` : `/market/${position.marketId}`;

  return (
    <Card hover className="flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant="info">#{position.marketId}</Badge>
            <Badge variant="pending">{position.version.toUpperCase()}</Badge>
            <span>{icon}</span>
          </div>
          <Badge variant={variant}>{label}</Badge>
        </div>

        <Link href={marketHref}>
          <h3 className="text-sm font-medium text-white hover:text-purple-400 transition line-clamp-2 mb-3">
            {position.question}
          </h3>
        </Link>

        {position.status === "created" && (
          <div className="mb-3 rounded-lg border border-yellow-600/30 bg-yellow-950/20 px-3 py-2">
            <p className="text-[11px] text-yellow-200">
              Poliza creada sin stake. Ve al mercado para participar como asegurador o viajero.
            </p>
          </div>
        )}

        {position.version === "v3" && position.status === "active" && (
          <div className="mb-3 rounded-lg border border-sky-600/30 bg-sky-950/20 px-3 py-2">
            <p className="text-[11px] text-sky-200">
              Información del resultado bloqueada por etapa. Se revela tras liquidación (settle).
            </p>
          </div>
        )}

        {position.version === "v3" && position.settled && position.appliedTier !== null && (
          <div className="mb-3 rounded-lg border border-indigo-600/30 bg-indigo-950/20 px-3 py-2 text-[11px] text-indigo-200">
            Tier aplicado: {position.appliedTier === 0 ? "No breach" : `Tier ${position.appliedTier}`}
            {position.appliedPayoutBps !== null && (
              <span className="text-indigo-300"> · payout {(position.appliedPayoutBps / 100).toFixed(0)}%</span>
            )}
          </div>
        )}

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
                  {position.isWinner ? `${formatEther(position.payout)} ETH` : "-"}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {position.status === "created" && (
        <Link href={marketHref}>
          <Button variant="primary" size="sm" className="w-full">
            Ir al mercado para stakear
          </Button>
        </Link>
      )}

      {position.status === "claimable" && (
        <Button
          variant="success"
          size="sm"
          className="w-full"
          loading={claiming}
          onClick={() => onClaim(position)}
        >
          Reclamar payout
        </Button>
      )}
    </Card>
  );
}
