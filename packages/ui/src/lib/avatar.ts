/**
 * The fallback shown when a user has no avatar, or it fails to load: the
 * first letter or digit of their name, uppercased. "?" when there is none.
 */
export function avatarInitial(name: string): string {
  const match = /[\p{L}\p{N}]/u.exec(name);
  return match ? match[0].toLocaleUpperCase("en") : "?";
}
