export function Card({
  hover = false,
  className = "",
  children,
}: {
  hover?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`bg-gray-800/60 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50 transition-all duration-300 ${
        hover ? "hover:border-purple-500/40 hover:bg-gray-800/80 hover:shadow-lg hover:shadow-purple-900/20" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
