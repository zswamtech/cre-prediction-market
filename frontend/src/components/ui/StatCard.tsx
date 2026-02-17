type StatColor = "white" | "yellow" | "green" | "purple" | "blue" | "red";

const colorClasses: Record<StatColor, string> = {
  white: "text-white",
  yellow: "text-yellow-400",
  green: "text-green-400",
  purple: "text-purple-400",
  blue: "text-blue-400",
  red: "text-red-400",
};

export function StatCard({
  label,
  value,
  color = "white",
  icon,
}: {
  label: string;
  value: string | number;
  color?: StatColor;
  icon?: string;
}) {
  return (
    <div className="bg-gray-800/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50">
      <p className="text-gray-400 text-sm">{label}</p>
      <div className="flex items-center gap-2 mt-1">
        {icon && <span className="text-2xl">{icon}</span>}
        <p className={`text-3xl font-bold ${colorClasses[color]}`}>{value}</p>
      </div>
    </div>
  );
}
