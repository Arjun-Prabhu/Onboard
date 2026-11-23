/**
 * @file Local ZIP-centroid distance helper for the proximity matching factor.
 *
 * A small lookup table of approximate Charlotte-area ZIP centroids keeps this self-contained
 * (NFR-1) — no geocoding API needed.
 */

/** Approximate [lat, lng] centroids for Charlotte-area ZIP codes. */
const ZIP_CENTROIDS: Record<string, [number, number]> = {
  '28202': [35.227, -80.843],
  '28203': [35.208, -80.858],
  '28204': [35.214, -80.826],
  '28205': [35.221, -80.788],
  '28206': [35.252, -80.82],
  '28207': [35.195, -80.827],
  '28208': [35.233, -80.906],
  '28209': [35.179, -80.854],
  '28210': [35.13, -80.857],
  '28211': [35.169, -80.795],
  '28212': [35.191, -80.745],
  '28213': [35.286, -80.733],
  '28215': [35.243, -80.71],
  '28216': [35.299, -80.876],
  '28217': [35.17, -80.908],
  '28226': [35.108, -80.82],
  '28262': [35.325, -80.744],
  '28269': [35.335, -80.8],
  '28277': [35.055, -80.818],
};

/** Distance treated as "far" for normalization (miles). */
export const MAX_REASONABLE_MILES = 20;

/**
 * Great-circle distance between two ZIP centroids.
 * @param zipA - First ZIP.
 * @param zipB - Second ZIP.
 * @returns Distance in miles, or `null` when either ZIP is unknown.
 */
export function zipDistanceMiles(zipA: string, zipB: string): number | null {
  const a = ZIP_CENTROIDS[zipA];
  const b = ZIP_CENTROIDS[zipB];
  if (!a || !b) return null;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
