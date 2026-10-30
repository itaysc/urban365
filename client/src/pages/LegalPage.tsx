import { Link } from 'react-router-dom';
import { PRIVACY, TERMS, type LegalDocument } from '@/content/legal';
import { SiteHeader } from '@/components/SiteHeader';

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

      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 sm:p-10">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">{doc.title}</h1>
          <p className="mt-1 text-sm text-slate-500">עודכן לאחרונה: {doc.updated}</p>
        </header>

        {unfilled > 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            טיוטה. נותרו {unfilled} פרטים להשלמה (מסומנים ברקע צהוב), והמסמך טעון בדיקה
            משפטית לפני פרסום.
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

        <footer className="border-t border-slate-200 pt-4 text-sm text-slate-500">
          <Link to={doc === TERMS ? '/policy' : '/terms'} className="text-blue-700 hover:underline">
            {doc === TERMS ? 'מדיניות הפרטיות' : 'תנאי השימוש'}
          </Link>
        </footer>
      </div>
    </div>
  );
}

export function TermsPage() {
  return <Document doc={TERMS} />;
}

export function PrivacyPage() {
  return <Document doc={PRIVACY} />;
}
