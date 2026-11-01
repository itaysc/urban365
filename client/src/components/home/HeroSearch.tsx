import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { Section } from '@/types/yad2';

const TABS: { value: Section; label: string }[] = [
  { value: 'forsale', label: 'מכירה' },
  { value: 'rent', label: 'השכרה' },
  { value: 'commercial', label: 'מסחרי' },
];

/**
 * The one thing the home page asks for: where.
 *
 * Deliberately a single box and three tabs. Every filter the results page offers is
 * still there once you arrive, and putting rooms, price and property type on the front
 * door would ask somebody to describe a flat before they have said which city — the
 * wrong order, and a wall of controls to meet a site with.
 */
export function HeroSearch() {
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>('forsale');
  const [where, setWhere] = useState('');

  const submit = () => {
    const params = new URLSearchParams({ section });
    // `q` rather than `city`: somebody may type a street or a neighbourhood, and the
    // results page already searches across all three with it.
    if (where.trim()) params.set('q', where.trim());

    navigate(`/search?${params}`);
  };

  return (
    <form
      className="w-full max-w-2xl rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur sm:p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="mb-3 flex gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setSection(tab.value)}
            aria-pressed={section === tab.value}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              section === tab.value
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="hero-where">
          עיר, שכונה או רחוב
        </label>
        <input
          id="hero-where"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
          placeholder="עיר, שכונה או רחוב"
          value={where}
          onChange={(e) => setWhere(e.target.value)}
        />
        <button
          type="submit"
          aria-label="חיפוש"
          className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-medium text-white transition hover:bg-blue-800"
        >
          <Search className="h-5 w-5" aria-hidden />
          <span className="hidden sm:inline">חיפוש</span>
        </button>
      </div>
    </form>
  );
}
