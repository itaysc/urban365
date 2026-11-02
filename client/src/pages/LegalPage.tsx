import { Link } from 'react-router-dom';
import { ACCESSIBILITY, PRIVACY, TERMS, type LegalDocument } from '@/content/legal';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

/**
 * The three documents and where they live.
 *
 * One list rather than a condition per page: the foot of each document offers the
 * other two, and with three of them "the other one" stopped being a thing a ternary
 * could express — it had already started sending the privacy policy to itself.
 */
const DOCUMENTS: { doc: LegalDocument; to: string; label: string }[] = [
  { doc: TERMS, to: '/terms', label: 'תנאי השימוש' },
  { doc: PRIVACY, to: '/policy', label: 'מדיניות הפרטיות' },
  { doc: ACCESSIBILITY, to: '/accessibility', label: 'הצהרת הנגישות' },
];

/** Anything still in `[[…]]` is a blank the business has to fill before this goes live. */
const PLACEHOLDER = /\[\[[^\]]+\]\]/g;

/**
 * Draws attention to the blanks instead of letting them read as prose.
 *
 * A document that ships still saying `[[ח.פ.]]` is obviously unfinished; the same
 * document with an invented company number would look finished and be worse. Marking
 * them makes the unfinished state impossible to miss in review.
 */
function withPlaceholders(text: string) {
  const parts = text.split(PLACEHOLDER);
  const found = text.match(PLACEHOLDER) ?? [];

  return parts.flatMap((part, i) => [
    part,
    found[i] ? (
      <mark key={i} className="rounded bg-amber-100 px-1 text-amber-900">
        {found[i]}
      </mark>
    ) : null,
  ]);
}

function Document({ doc }: { doc: LegalDocument }) {
  const unfilled = JSON.stringify(doc).match(PLACEHOLDER)?.length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />

      <main id="main" tabIndex={-1} className="mx-auto flex max-w-3xl flex-col gap-6 p-6 sm:p-10">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">{doc.title}</h1>
          <p className="mt-1 text-sm text-slate-500">עודכן לאחרונה: {doc.updated}</p>
        </header>

        {unfilled > 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            טיוטה. נותרו {unfilled} פרטים להשלמה (מסומנים ברקע צהוב), והמסמך טעון{' '}
            {doc.review ?? 'בדיקה משפטית'} לפני פרסום.
          </p>
        )}

        <p className="leading-relaxed text-slate-700">{withPlaceholders(doc.intro)}</p>

        {doc.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-slate-900">{section.heading}</h2>

            {section.blocks.map((block, i) =>
              block.type === 'p' ? (
                <p key={i} className="leading-relaxed text-slate-700">
                  {withPlaceholders(block.text)}
                </p>
              ) : (
                <ul key={i} className="flex list-disc flex-col gap-2 ps-6 text-slate-700">
                  {block.items.map((item) => (
                    <li key={item} className="leading-relaxed">
                      {withPlaceholders(item)}
                    </li>
                  ))}
                </ul>
              ),
            )}
          </section>
        ))}

        <footer className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-200 pt-4 text-sm text-slate-500">
          {DOCUMENTS.filter((entry) => entry.doc !== doc).map((entry) => (
            <Link key={entry.to} to={entry.to} className="text-blue-700 hover:underline">
              {entry.label}
            </Link>
          ))}
        </footer>
      </main>

      <SiteFooter />
    </div>
  );
}

export function TermsPage() {
  return <Document doc={TERMS} />;
}

export function PrivacyPage() {
  return <Document doc={PRIVACY} />;
}

export function AccessibilityPage() {
  return <Document doc={ACCESSIBILITY} />;
}
