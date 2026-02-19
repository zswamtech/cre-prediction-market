import type { PositionStatus } from "@/hooks/useUserPositions";

type FilterOption = "all" | PositionStatus;

const filters: { value: FilterOption; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "active", label: "Activas" },
  { value: "claimable", label: "Por reclamar" },
  { value: "claimed", label: "Reclamadas" },
  { value: "lost", label: "Perdidas" },
];

export function FilterTabs({
  active,
  onChange,
  counts,
}: {
  active: FilterOption;
  onChange: (filter: FilterOption) => void;
  counts: Record<FilterOption, number>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((f) => (
        <button
          key={f.value}
          type="button"
          onClick={() => onChange(f.value)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            active === f.value
              ? "bg-purple-600/20 text-purple-300 border border-purple-500/40"
              : "text-gray-400 hover:text-white hover:bg-gray-800/50 border border-transparent"
          }`}
        >
          {f.label}
          <span className="ml-1.5 text-xs opacity-60">{counts[f.value]}</span>
        </button>
      ))}
    </div>
  );
}

export type { FilterOption };
