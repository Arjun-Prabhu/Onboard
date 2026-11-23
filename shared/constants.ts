/**
 * @file Shared constants. Skill catalogs are per organization (see Organization settings), so
 * nothing org-specific lives here.
 */

/**
 * Factor weights. Skill match dominates because an unqualified volunteer hurts the session most;
 * reliability is next because a no-show leaves participants without help. Fairness is small but
 * non-zero so the same few volunteers don't burn out.
 */
export const MATCH_WEIGHTS = {
  skill: 35,
  reliability: 25,
  proximity: 15,
  experience: 15,
  fairness: 10,
} as const;
