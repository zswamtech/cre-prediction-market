import { formatEther } from "viem";

export function PoolVisualization({
  yesPool,
  noPool,
}: {
  yesPool: bigint;
  noPool: bigint;
}) {
  const total = yesPool + noPool;
  const yesPct = total > 0n ? Number((yesPool * 100n) / total) : 50;
  const noPct = 100 - yesPct;

  return (
    <div className="space-y-3">
      {/* Bar */}
      <div className="w-full h-4 rounded-full bg-gray-700/50 overflow-hidden flex">
        <div
          className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-700"
          style={{ width: `${yesPct}%` }}
        />
        <div
          className="h-full bg-gradient-to-r from-red-400 to-red-500 transition-all duration-700"
          style={{ width: `${noPct}%` }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between text-sm">
        <div>
          <span className="text-green-400 font-semibold">SI</span>
          <span className="text-gray-400 ml-2">{yesPct}%</span>
          <span className="text-gray-500 ml-2 font-mono text-xs">
            {formatEther(yesPool)} ETH
          </span>
        </div>
        <div className="text-right">
          <span className="text-red-400 font-semibold">NO</span>
          <span className="text-gray-400 ml-2">{noPct}%</span>
          <span className="text-gray-500 ml-2 font-mono text-xs">
            {formatEther(noPool)} ETH
          </span>
        </div>
      </div>
    </div>
  );
}
