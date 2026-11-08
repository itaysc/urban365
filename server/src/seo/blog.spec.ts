import { describe, expect, it } from 'vitest';
import { BLOG_GROUPS, BLOG_POSTS, blogPath, blogPost } from './blog.js';
import { renderBlogIndex, renderBlogPost } from './render-blog.js';
import { llmsFullTxt, llmsTxt } from './llms.js';
import { sitemapBlogXml } from './sitemap.js';

const APP = 'https://urban365.example';

describe('blog catalog', () => {
  it('gives every post its own slug, a title and something to read', () => {
    const slugs = BLOG_POSTS.map((post) => post.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
    for (const post of BLOG_POSTS) {
      expect(post.title.length).toBeGreaterThan(0);
      expect(post.description.length).toBeGreaterThan(0);
      expect(post.paragraphs.length).toBeGreaterThan(1);
      expect(BLOG_GROUPS.some((group) => group.id === post.group)).toBe(true);
    }
  });

  it('finds a post by the slug the URL carries, and nothing else', () => {
    expect(blogPost(BLOG_POSTS[0].slug)?.title).toBe(BLOG_POSTS[0].title);
    expect(blogPost('אין-דף-כזה')).toBeUndefined();
    expect(blogPost('../nadlan')).toBeUndefined();
  });
});

describe('blog pages', () => {
  it('lists every article on the index', () => {
    const html = renderBlogIndex(APP);

    expect(html).toContain('<h1>בלוג</h1>');
    expect(html).toContain('aria-current="page"');
    for (const post of BLOG_POSTS) {
      expect(html).toContain(blogPath(post.slug));
      expect(html).toContain(post.title);
    }
  });

  it('renders an article with a way back and the tool it points at', () => {
    const post = BLOG_POSTS[0];
    const html = renderBlogPost(post, APP);

    expect(html).toContain(`<h1>${post.title}</h1>`);
    expect(html).toContain(`<link rel="canonical" href="${APP}${blogPath(post.slug)}">`);
    expect(html).toContain('href="/blog"');
    expect(html).toContain(`${APP}${post.cta.href}`);
    expect(html).toContain('אינה שמאות מקרקעין');
  });

  it('escapes a title rather than letting it become markup', () => {
    const html = renderBlogPost(
      {
        ...BLOG_POSTS[0],
        title: '<script>',
        paragraphs: ['a & b', 'second'],
      },
      APP,
    );

    expect(html).toContain('<h1>&lt;script&gt;</h1>');
    expect(html).toContain('a &amp; b');
    expect(html).not.toContain('<h1><script>');
  });
});

describe('blog in the sitemap', () => {
  it('offers the index and every article in their own file', () => {
    const xml = sitemapBlogXml(APP);

    expect(xml).toContain(`<loc>${APP}/blog</loc>`);
    for (const post of BLOG_POSTS) {
      expect(xml).toContain(`<loc>${APP}${blogPath(post.slug)}</loc>`);
    }
  });
});

describe('blog for models', () => {
  it('lists every article, and the file a model can read in one request', () => {
    const index = llmsTxt(APP);
    const full = llmsFullTxt(APP);

    expect(index).toContain(`${APP}/sitemap-blog.xml`);
    expect(index).toContain(`${APP}/llms-full.txt`);
    for (const post of BLOG_POSTS) {
      expect(index).toContain(`${APP}${blogPath(post.slug)}`);
      expect(index).toContain(post.title);
      expect(full).toContain(post.title);
      expect(full).toContain(post.paragraphs[0]);
    }
  });
});
