import { shouldAdoptGooglePicture } from './google-avatar.js';

describe('shouldAdoptGooglePicture', () => {
  const picture = 'https://lh3.googleusercontent.com/a/abc123';

  it('adopts it for an account with no picture at all', () => {
    expect(shouldAdoptGooglePicture({ avatarUrl: null, avatarStorageKey: null }, picture)).toBe(true);
  });

  it('leaves an uploaded picture alone', () => {
    expect(
      shouldAdoptGooglePicture(
        { avatarUrl: '/api/v1/users/u1/avatar?v=abc', avatarStorageKey: 'avatars/u1/x.png' },
        picture,
      ),
    ).toBe(false);
  });

  it('does not put one back after it was removed and replaced by Google before', () => {
    // avatarUrl set, no storage key: this is Google's own picture, already adopted.
    // Re-adopting is harmless but pointless, and treating it as absent would overwrite
    // a newer Google URL with an older one on a stale sign-in.
    expect(shouldAdoptGooglePicture({ avatarUrl: picture, avatarStorageKey: null }, picture)).toBe(false);
  });

  it('counts a half-written row as having a picture', () => {
    expect(
      shouldAdoptGooglePicture({ avatarUrl: null, avatarStorageKey: 'avatars/u1/x.png' }, picture),
    ).toBe(false);
  });

  it('does nothing when Google sent no picture', () => {
    expect(shouldAdoptGooglePicture({ avatarUrl: null, avatarStorageKey: null }, null)).toBe(false);
  });
});
