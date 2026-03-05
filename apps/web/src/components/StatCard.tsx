export function StatCard({
  label,
  value,
  unit,
  colorClass,
}: {
  label: string;
  value: string;
  unit?: string;
  colorClass?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3.5">
      <div className="mb-1 text-xs text-gray-400">{label}</div>
      <div className={`text-2xl font-bold ${colorClass ?? 'text-gray-900'}`}>{value}</div>
      {unit && <div className="text-[11px] text-gray-400">{unit}</div>}
    </div>
  );
}
