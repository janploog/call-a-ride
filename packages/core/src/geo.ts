import type { Coordinate } from "./schemas";

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Geohash-Encoding (Standard-Base32). Präzision 5 ≈ 4,9 × 4,9 km Zelle —
 * der Partition Key der DriverLocations-Tabelle für die Umkreissuche.
 */
export function encodeGeohash(coord: Coordinate, precision = 5): string {
  let minLat = -90;
  let maxLat = 90;
  let minLon = -180;
  let maxLon = 180;
  let hash = "";
  let bit = 0;
  let ch = 0;
  let evenBit = true;

  while (hash.length < precision) {
    if (evenBit) {
      const mid = (minLon + maxLon) / 2;
      if (coord.lon >= mid) {
        ch = (ch << 1) | 1;
        minLon = mid;
      } else {
        ch = ch << 1;
        maxLon = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (coord.lat >= mid) {
        ch = (ch << 1) | 1;
        minLat = mid;
      } else {
        ch = ch << 1;
        maxLat = mid;
      }
    }
    evenBit = !evenBit;
    bit += 1;
    if (bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 0], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

/** Zellgrößen (Grad) je Geohash-Präzision, für die Nachbarzellen-Berechnung. */
function cellSize(precision: number): { latDeg: number; lonDeg: number } {
  const totalBits = precision * 5;
  const lonBits = Math.ceil(totalBits / 2);
  const latBits = Math.floor(totalBits / 2);
  return { latDeg: 180 / 2 ** latBits, lonDeg: 360 / 2 ** lonBits };
}

/**
 * Die 3×3-Nachbarschaft der Zelle um `coord` — deckt bei Präzision 5 einen
 * Suchradius von mindestens ~5 km ab, egal wie nah `coord` am Zellrand liegt.
 */
export function geohashNeighborhood(coord: Coordinate, precision = 5): string[] {
  const { latDeg, lonDeg } = cellSize(precision);
  const hashes = new Set<string>();
  for (const [dLat, dLon] of NEIGHBOR_OFFSETS) {
    const lat = Math.min(90, Math.max(-90, coord.lat + dLat * latDeg));
    let lon = coord.lon + dLon * lonDeg;
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
    hashes.add(encodeGeohash({ lat, lon }, precision));
  }
  return [...hashes];
}

const EARTH_RADIUS_M = 6_371_000;

export function haversineDistanceMeters(a: Coordinate, b: Coordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
