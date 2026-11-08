import {
  BLOG_GROUPS,
  BLOG_POSTS,
  BLOG_PUBLISHED,
  blogPath,
  type BlogPost,
} from './blog.js';
import { esc } from './html.js';
import { breadcrumbs, page } from './layout.js';

/**
 * The blog index and one article.
 *
 * Links between these pages stay relative, so they work on the API host and on the
 * public site alike. Links into the app — the calculator, the valuation — are
 * absolute, because the API host does not serve the React bundle.
 */
function toolHref(href: string, appUrl: string): string {
  if (href.startsWith('/blog') || href.startsWith('/nadlan')) return href;
  return `${appUrl}${href}`;
}

function prose(post: BlogPost): string {
  const open = post.paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join('\n');
  const list = post.points
    ? `<ul>\n${post.points.map((point) => `<li>${esc(point)}</li>`).join('\n')}\n</ul>`
    : '';
  const close = (post.after ?? []).map((paragraph) => `<p>${esc(paragraph)}</p>`).join('\n');
  return `<div class="prose">\n${open}\n${list}\n${close}</div>`;
}

/** Every article, grouped, so a crawler and a reader meet the same list. */
export function renderBlogIndex(appUrl: string, links = ''): string {
  const canonical = `${appUrl}/blog`;
  const trail = breadcrumbs(
    [
      { name: 'ראשי', href: `${appUrl}/` },
      { name: 'בלוג', href: '/blog' },
    ],
    canonical,
  );

  const groups = BLOG_GROUPS.map((group) => {
    const posts = BLOG_POSTS.filter((post) => post.group === group.id);
    const items = posts
      .map(
        (post) => `<li><a href="${esc(blogPath(post.slug))}">
<strong>${esc(post.title)}</strong>
<span>${esc(post.description)}</span>
</a></li>`,
      )
      .join('\n');

    return `<section class="group">
<h2>${esc(group.title)}</h2>
<p class="note">${esc(group.blurb)}</p>
<ul class="posts">
${items}
</ul>
</section>`;
  }).join('\n');

  const description =
    'הסברים קצרים על משכנתא בישראל, על שוק הדירות, ועל איך מעריכים שווי דירה מעסקאות שנרשמו.';

  return page({
    title: 'בלוג | Urban365',
    description,
    canonical,
    indexable: true,
    appUrl,
    onBlog: true,
    links,
    structuredData: [
      trail.data,
      {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: 'הבלוג של Urban365',
        description,
        inLanguage: 'he',
        url: canonical,
        blogPost: BLOG_POSTS.map((post) => ({
          '@type': 'BlogPosting',
          headline: post.title,
          url: `${appUrl}${blogPath(post.slug)}`,
          datePublished: BLOG_PUBLISHED.toISOString().slice(0, 10),
        })),
      },
    ],
    body: `${trail.html}
<h1>בלוג</h1>
<p class="lede">${esc(description)}</p>
${groups}`,
  });
}

/** One question, and the tool that answers the next one with numbers. */
export function renderBlogPost(post: BlogPost, appUrl: string, links = ''): string {
  const path = blogPath(post.slug);
  const canonical = `${appUrl}${path}`;
  const trail = breadcrumbs(
    [
      { name: 'ראשי', href: `${appUrl}/` },
      { name: 'בלוג', href: '/blog' },
      { name: post.title, href: path },
    ],
    canonical,
  );

  const siblings = BLOG_POSTS.filter((other) => other.group === post.group && other.slug !== post.slug);
  const more =
    siblings.length === 0
      ? ''
      : `<section class="moreposts">
<h2>עוד באותו נושא</h2>
<ul>
${siblings
  .map((other) => `<li><a href="${esc(blogPath(other.slug))}">${esc(other.title)}</a></li>`)
  .join('\n')}
</ul>
</section>`;

  return page({
    title: `${post.title} | Urban365`,
    description: post.description,
    canonical,
    indexable: true,
    appUrl,
    onBlog: true,
    links,
    structuredData: [
      trail.data,
      {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.description,
        inLanguage: 'he',
        datePublished: BLOG_PUBLISHED.toISOString().slice(0, 10),
        mainEntityOfPage: canonical,
        author: { '@type': 'Organization', name: 'Urban365' },
        publisher: { '@type': 'Organization', name: 'Urban365' },
      },
    ],
    body: `${trail.html}
<h1>${esc(post.title)}</h1>
<p class="lede">${esc(post.description)}</p>
${prose(post)}
<p><a class="cta" href="${esc(toolHref(post.cta.href, appUrl))}">${esc(post.cta.label)}</a></p>
${more}
<p class="note">זה הסבר על איך לקרוא את המספרים, לא ייעוץ. משכנתא תלויה בבנק וביום, והערכת השווי באתר היא אינדיקטיבית — מבוססת על עסקאות שנרשמו, ואינה שמאות מקרקעין.</p>`,
  });
}
