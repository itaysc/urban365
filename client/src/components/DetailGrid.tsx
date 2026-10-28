export interface Detail {
  label: string;
  value: string | number | null;
}

/**
 * "פרטים נוספים" — yad2's two-column label/value grid. Rows it has no value for are
 * dropped rather than shown empty.
 */
export function DetailGrid({ title, details }: { title: string; details: Detail[] }) {
  const rows = details.filter((d) => d.value !== null && d.value !== '');
  if (rows.length === 0) return null;

  return (
    <section>
      <h3 className="mb-3 font-semibold text-slate-900">{title}</h3>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        {rows.map((d) => (
          <div key={d.label} className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-2">
            <dt className="text-slate-500">{d.label}</dt>
            <dd className="text-slate-900">{d.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
