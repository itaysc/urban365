import { useEffect, useState, type FormEvent } from 'react';

interface Props {
  onSearch: (input: string, refresh: boolean) => void;
  loading: boolean;
  initialValue?: string;
  error?: string | null;
}

export function SearchForm({ onSearch, loading, initialValue = '', error }: Props) {
  const [value, setValue] = useState(initialValue);
  const [refresh, setRefresh] = useState(false);

  // Landing straight on /agency/:id should show that agency in the box.
  useEffect(() => setValue(initialValue), [initialValue]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSearch(value.trim(), refresh);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="מספר סוכנות (למשל 6816047) או קישור ליד2"
          dir="auto"
          aria-invalid={Boolean(error)}
          className={`flex-1 rounded-lg border px-4 py-3 text-base outline-none focus:border-slate-900 ${
            error ? 'border-red-400' : 'border-slate-300'
          }`}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="rounded-lg bg-slate-900 px-6 py-3 font-medium text-white disabled:opacity-40"
        >
          {loading ? 'טוען…' : 'חיפוש'}
        </button>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={refresh} onChange={(e) => setRefresh(e.target.checked)} disabled={loading} />
        התעלם ממטמון וסרוק מחדש
      </label>
    </form>
  );
}
