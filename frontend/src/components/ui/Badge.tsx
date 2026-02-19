type BadgeVariant = "active" | "settled" | "claimed" | "pending" | "error" | "flight" | "property" | "info";

const variantClasses: Record<BadgeVariant, string> = {
  active: "bg-yellow-600/20 text-yellow-400 border-yellow-600/40",
  settled: "bg-green-600/20 text-green-400 border-green-600/40",
  claimed: "bg-blue-600/20 text-blue-400 border-blue-600/40",
  pending: "bg-gray-700/40 text-gray-300 border-gray-700/60",
  error: "bg-red-600/20 text-red-400 border-red-600/40",
  flight: "bg-sky-600/20 text-sky-300 border-sky-600/40",
  property: "bg-emerald-600/20 text-emerald-300 border-emerald-600/40",
  info: "bg-purple-600/20 text-purple-400 border-purple-600/40",
};

export function Badge({
  variant,
  children,
  className = "",
}: {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs border px-2 py-1 rounded font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
