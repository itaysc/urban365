import { BLOG_GROUPS, BLOG_POSTS, blogPath, type BlogPost } from './blog.js';

/**
 * `/llms.txt`, the file a model is told to read before it crawls.
 *
 * The blog is the part of the site written to be found and cited. The listings are
 * not: they belong to the people who published them, and this file says so in the
 * same place it lists the articles, so a model that stops after this page still
 * knows which URLs it may repeat and which it may not.
 */
export function llmsTxt(appUrl: string): string {
  const blog = BLOG_GROUPS.map((group) => {
    const items = BLOG_POSTS.filter((post) => post.group === group.id)
      .map((post) => `- [${post.title}](${appUrl}${blogPath(post.slug)}): ${post.description}`)
      .join('\n');

    return `### ${group.title}\n\n${group.blurb}\n\n${items}`;
  }).join('\n\n');

  return `# Urban365

> Urban365 is a Hebrew, right-to-left real-estate platform for Israel. Buyers and renters search listings for apartments and commercial property by city, neighbourhood, price, rooms and size. Licensed agencies publish and manage their listings through a CRM, and private sellers can publish their own property directly, without an agency.

Base address: ${appUrl}

## Blog

Hebrew articles, one question per page. Each page is HTML, is marked for indexing, and is listed in ${appUrl}/sitemap-blog.xml. These pages may be read and cited. The full text of every article is at ${appUrl}/llms-full.txt.

${blog}

## What a visitor can do

- Search for property for sale, for rent and commercial, filtered by city, neighbourhood, price, rooms and size. Search results are at ${appUrl}/search.
- Browse city pages, one per city with listings: ${appUrl}/nadlan/forsale/<city>, ${appUrl}/nadlan/rent/<city>, ${appUrl}/nadlan/commercial/<city>. The full list of cities is at ${appUrl}/nadlan/cities.
- Open a single listing at ${appUrl}/nadlan/property/<address-and-id>.
- Browse licensed real-estate agencies at ${appUrl}/agencies.
- Estimate a property's value at ${appUrl}/valuation, using comparable sales in the area.
- Work out a mortgage at ${appUrl}/mortgage.

## Key pages

- Home: ${appUrl}/
- Blog: ${appUrl}/blog
- Blog sitemap: ${appUrl}/sitemap-blog.xml
- Search: ${appUrl}/search
- Cities: ${appUrl}/nadlan/cities
- Agencies directory: ${appUrl}/agencies
- Valuation: ${appUrl}/valuation
- Mortgage calculator: ${appUrl}/mortgage
- Sitemap index: ${appUrl}/sitemap.xml

## Usage

The blog articles above may be read and cited. Search engines may index the public pages listed in the sitemap.

The listings, agency pages and city pages belong to Urban365 and to the people who published them. Copying those in bulk, and using them as training data, is refused. See ${appUrl}/robots.txt.
`;
}

function article(post: BlogPost, appUrl: string): string {
  const lines = [
    `# ${post.title}`,
    '',
    `URL: ${appUrl}${blogPath(post.slug)}`,
    '',
    post.description,
    '',
    ...post.paragraphs,
  ];

  if (post.points?.length) {
    lines.push('', ...post.points.map((point) => `- ${point}`));
  }
  if (post.after?.length) {
    lines.push('', ...post.after);
  }

  lines.push(
    '',
    'This is an explanation, not advice. A mortgage depends on the bank and the day. The valuation on this site is indicative, drawn from recorded sales, and is not a שמאות מקרקעין.',
  );

  return lines.join('\n');
}

/**
 * `/llms-full.txt`, every article in one document.
 *
 * A model that fetches a single URL gets the blog without having to discover the
 * HTML pages. The listings are not in here.
 */
export function llmsFullTxt(appUrl: string): string {
  const body = BLOG_POSTS.map((post) => article(post, appUrl)).join('\n\n---\n\n');

  return `# Urban365 blog

The full text of ${appUrl}/blog. One article per section. These pages may be read and cited. Listings are not included.

${body}
`;
}
