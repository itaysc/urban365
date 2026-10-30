/**
 * Bolds the part of a label the person has actually typed.
 *
 * Split rather than a regex over the label: a search term is arbitrary text and may
 * contain characters a regex would read as syntax.
 */
export function highlight(label: string, term: string) {
  const at = term ? label.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (at === -1) return label;

  return (
    <>
      {label.slice(0, at)}
      <strong className="font-semibold text-slate-900">{label.slice(at, at + term.length)}</strong>
      {label.slice(at + term.length)}
    </>
  );
}
