import { Link } from 'react-router-dom';
import { HOME_GUIDE, type GuideLink } from '@/content/home-guide';

const linkClass =
  'font-semibold text-blue-700 underline decoration-blue-200 underline-offset-4 hover:decoration-blue-700';

/** City pages and the blog are HTML from the API, so a router link would miss them. */
function GuideAnchor({ href, label }: GuideLink) {
  if (href === '/nadlan' || href === '/blog') {
    return (
      <a className={linkClass} href={href}>
        {label}
      </a>
    );
  }
  return (
    <Link className={linkClass} to={href}>
      {label}
    </Link>
  );
}

/**
 * The same reading the server-rendered door carries.
 *
 * A crawler that only saves the first HTML response, and a person who scrolls past
 * the cities, should find the same explanation of prices, mortgage and valuation.
 */
export function HomeGuide() {
  return (
    <article className="mx-auto mt-14 max-w-3xl border-t border-slate-200 pt-10">
      {HOME_GUIDE.map((section, index) => {
        const Heading = index === 0 ? 'h2' : 'h3';
        return (
          <section key={section.heading}>
            <Heading
              className={
                index === 0
                  ? 'text-xl font-bold text-slate-900'
                  : 'mt-8 text-lg font-bold text-slate-900'
              }
            >
              {section.heading}
            </Heading>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 24)} className="mt-3 text-base leading-7 text-slate-700">
                {paragraph}
              </p>
            ))}
            {section.links?.map((link) => (
              <p key={link.href} className="mt-3 text-base leading-7">
                <GuideAnchor {...link} />
              </p>
            ))}
          </section>
        );
      })}
    </article>
  );
}
