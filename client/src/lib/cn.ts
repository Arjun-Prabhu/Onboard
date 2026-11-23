/**
 * @file Tiny className joiner.
 */

/**
 * Joins truthy class names with spaces.
 * @param parts - Class names, or falsy values to skip.
 * @returns A single className string.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
