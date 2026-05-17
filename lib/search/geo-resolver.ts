import GEO from "@/lib/data/geo.json";
import POSTCODES from "@/lib/data/postcodes.json";

export interface Region {
  code: string;
  name: string;
  departments: string[];
}

export interface Department {
  code: string;
  name: string;
  regionCode: string;
}

export const REGIONS: Region[] = (GEO as { regions: Region[] }).regions;
export const DEPARTMENTS: Department[] = (GEO as { departments: Department[] })
  .departments;

const POSTCODE_COORDS = POSTCODES as unknown as Record<string, [number, number]>;
const DEPT_BY_CODE = new Map(DEPARTMENTS.map((d) => [d.code, d]));
const REGION_BY_CODE = new Map(REGIONS.map((r) => [r.code, r]));

/**
 * Expand a {regions, departments} selection into the deduplicated list of
 * department codes to feed to INSEE Sirene.
 */
export function expandGeoSelection(input: {
  regions?: string[];
  departments?: string[];
}): string[] {
  const out = new Set<string>();
  for (const r of input.regions ?? []) {
    const region = REGION_BY_CODE.get(r);
    if (region) for (const d of region.departments) out.add(d);
  }
  for (const d of input.departments ?? []) {
    if (DEPT_BY_CODE.has(d)) out.add(d);
  }
  return [...out].sort();
}

/** Return [lat, lng] for a French postal code, or null if unknown. */
export function coordsForPostcode(
  postcode: string | null | undefined,
): [number, number] | null {
  if (!postcode) return null;
  const v = POSTCODE_COORDS[postcode.trim()];
  return v ?? null;
}

/**
 * Haversine distance between two lat/lng points, in km.
 */
export function haversineKm(
  a: [number, number],
  b: [number, number],
): number {
  const R = 6371; // earth radius in km
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const lat1r = toRad(lat1);
  const lat2r = toRad(lat2);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1r) * Math.cos(lat2r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * From a center lat/lng + radius km, return the bounding box (minLat, maxLat,
 * minLng, maxLng) — used to short-list French departments that intersect, so
 * we can pass them as a rough pre-filter to Sirene before the precise
 * distance filter runs client/server-side.
 *
 * The bbox slightly overestimates to avoid missing edge departments.
 */
export function bboxForRadius(
  center: [number, number],
  radiusKm: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const [lat, lng] = center;
  // 1 degree latitude ≈ 111 km; longitude varies with cos(lat)
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos(toRad(lat)));
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

/**
 * Departments whose centroid (any commune we know) falls within the bbox.
 * Useful to narrow the Sirene `q=` query before the precise distance filter.
 */
export function departmentsInBbox(bbox: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}): string[] {
  const out = new Set<string>();
  for (const [cp, [lat, lng]] of Object.entries(POSTCODE_COORDS)) {
    if (
      lat >= bbox.minLat &&
      lat <= bbox.maxLat &&
      lng >= bbox.minLng &&
      lng <= bbox.maxLng
    ) {
      // department = first 2 (or 3 for DOM) chars of CP, with Corsica handled.
      if (cp.startsWith("20")) {
        const n = parseInt(cp.slice(0, 3), 10);
        out.add(Number.isFinite(n) && n < 202 ? "2A" : "2B");
      } else if (cp.startsWith("97") || cp.startsWith("98")) {
        out.add(cp.slice(0, 3));
      } else {
        out.add(cp.slice(0, 2));
      }
    }
  }
  return [...out];
}
