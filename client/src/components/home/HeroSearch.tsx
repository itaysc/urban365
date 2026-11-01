import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Search } from 'lucide-react';
import { fetchPlaceSuggestions } from '@/services/search';
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

  const [busy, setBusy] = useState(false);

  /**
   * Turn what was typed into a filter, not a phrase.
   *
   * Sending it as free text filtered correctly and read wrongly: the results page
   * names itself from the place being searched, so typing "חולון" arrived under the
   * heading "נדל״ן למכירה" with no city in it. Asking the suggest endpoint first means
   * a city becomes `city=`, a neighbourhood becomes `neighborhood=`, and the page can
   * say where you are. Anything it does not recognise — a street, a phrase — still
   * goes as `q`, which is what that parameter is for.
   */
  const submit = async () => {
    const typed = where.trim();
    const params = new URLSearchParams({ section });

    if (typed) {
      setBusy(true);
      try {
        const places = await fetchPlaceSuggestions(typed, section);
        const city = places.cities.find((c) => c.value === typed) ?? places.cities[0];
        const hood = places.neighborhoods.find((n) => n.value === typed);

        if (hood) {
          params.set('neighborhood', hood.value);
          params.set('city', hood.city);
        } else if (city && city.value.startsWith(typed)) {
          params.set('city', city.value);
        } else {
          params.set('q', typed);
        }
      } catch {
        // The lookup is a convenience. If it fails, the search still runs.
        params.set('q', typed);
      } finally {
        setBusy(false);
      }
    }

    navigate(`/search?${params}`);
  };

  return (
    <div className="w-full max-w-2xl">
      {/*
        The tabs sit on the photograph rather than in a strip inside the search card.
        Nesting them there made three boxes where one would do — a white card holding a
        grey tray holding a dark rectangle — and that stack of rectangles is what reads
        as dated. Out here they are the choice they are, and the card below stays one
        clean surface.
      */}
      <div className="mb-4 flex justify-center gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setSection(tab.value)}
            aria-pressed={section === tab.value}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              section === tab.value
                ? 'bg-white text-slate-900 shadow-lg'
                : 'bg-white/15 text-white ring-1 ring-inset ring-white/40 backdrop-blur-sm hover:bg-white/25'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* One pill, one action. The icon sits inside it rather than beside a bordered
          box, so there is nothing to see but the thing you type into. */}
      <form
        className="flex items-center gap-2 rounded-full bg-white p-2 shadow-2xl ring-1 ring-slate-900/5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <MapPin className="ms-3 h-5 w-5 shrink-0 text-slate-400" aria-hidden />

        <label className="sr-only" htmlFor="hero-where">
          עיר, שכונה או רחוב
        </label>
        <input
          id="hero-where"
          className="min-w-0 flex-1 bg-transparent px-1 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400"
          placeholder="עיר, שכונה או רחוב"
          value={where}
          onChange={(e) => setWhere(e.target.value)}
        />

        <button
          type="submit"
          aria-label="חיפוש"
          disabled={busy}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-700 text-white transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          <Search className="h-5 w-5" aria-hidden />
        </button>
      </form>
    </div>
  );
}
