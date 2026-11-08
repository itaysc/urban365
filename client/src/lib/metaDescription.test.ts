import { describe, expect, it } from 'vitest';
import { SEARCH_DESCRIPTION, describedPages, descriptionForPath } from './metaDescription';

describe('descriptionForPath', () => {
  it('describes the home page in the length a search result shows', () => {
    const description = descriptionForPath('/');

    expect(description).toContain('דירות למכירה ולהשכרה');
    expect(description?.length).toBeGreaterThanOrEqual(140);
    expect(description?.length).toBeLessThanOrEqual(160);
  });

  it('gives every public page its own description, in that same length', () => {
    for (const [path, description] of describedPages()) {
      expect(descriptionForPath(path), path).toBe(description);
      expect(description.length, path).toBeGreaterThanOrEqual(140);
      expect(description.length, path).toBeLessThanOrEqual(160);
    }
  });

  it('leaves a search and a signed-in page to be described elsewhere, or not at all', () => {
    expect(descriptionForPath('/search')).toBeNull();
    expect(descriptionForPath('/app/listings')).toBeNull();
    expect(SEARCH_DESCRIPTION.length).toBeGreaterThanOrEqual(140);
    expect(SEARCH_DESCRIPTION.length).toBeLessThanOrEqual(160);
  });
});
