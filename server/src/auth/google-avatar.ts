/** What we know about an account's current picture when Google signs it in. */
interface Current {
  avatarUrl: string | null;
  avatarStorageKey: string | null;
}

/**
 * Whether Google's picture should become this account's avatar.
 *
 * Only when there is nothing there at all. A picture the person uploaded must not be
 * replaced on every sign-in, and neither must their decision to remove one — an empty
 * avatar is a choice, not a gap waiting to be filled.
 *
 * `avatarStorageKey` is checked as well as `avatarUrl` because an uploaded picture sets
 * both, and a half-written row should still count as "they have one".
 */
export function shouldAdoptGooglePicture(current: Current, picture: string | null): boolean {
  if (!picture) return false;
  return current.avatarUrl === null && current.avatarStorageKey === null;
}
