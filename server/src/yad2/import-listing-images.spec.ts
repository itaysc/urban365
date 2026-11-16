import { listingPhotoUrls } from './import-listing-images.js';
import type { RawListing } from './yad2.types.js';

const card = (cover: string): RawListing => ({ token: 't', metaData: { coverImage: cover } });
const item = (images: string[]): RawListing => ({ token: 't', metaData: { images } });

describe('listingPhotoUrls', () => {
  it('puts the cover first and drops a gallery copy of it', () => {
    expect(listingPhotoUrls(card('https://img.example/a.jpg'), item(['https://img.example/a.jpg', 'https://img.example/b.jpg']))).toEqual([
      'https://img.example/a.jpg',
      'https://img.example/b.jpg',
    ]);
  });

  it('turns a protocol-relative address into https and ignores anything else', () => {
    expect(listingPhotoUrls(card('//img.example/a.jpg'), item(['not a url']))).toEqual(['https://img.example/a.jpg']);
  });
});
