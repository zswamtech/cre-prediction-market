import { formatEther } from "viem";
import { StatCard } from "@/components/ui/StatCard";
import type { PositionSummary } from "@/hooks/useUserPositions";

export function SummaryStats({ summary }: { summary: PositionSummary }) {
  const netColor = summary.netPnL >= 0n ? "green" : "red";
  const netPrefix = summary.netPnL >= 0n ? "+" : "";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        label="Total invertido"
        value={`${formatEther(summary.totalInvested)} ETH`}
        color="white"
      />
      <StatCard
        label="Reclamado"
        value={`${formatEther(summary.totalClaimed)} ETH`}
        color="blue"
      />
      <StatCard
        label="Por reclamar"
        value={`${formatEther(summary.totalClaimable)} ETH`}
        color="yellow"
      />
      <StatCard
        label="P&L neto"
        value={`${netPrefix}${formatEther(summary.netPnL)} ETH`}
        color={netColor}
      />
    </div>
  );
}
