import { describe, expect, it } from "vitest";
import { encodeGeohash, geohashNeighborhood, haversineDistanceMeters } from "./geo";

// Referenzpunkt: Berlin Brandenburger Tor
const BRANDENBURGER_TOR = { lat: 52.516275, lon: 13.377704 };

describe("encodeGeohash", () => {
  it("liefert bekannte Referenz-Hashes", () => {
    // Referenzwerte von geohash.org
    expect(encodeGeohash(BRANDENBURGER_TOR, 5)).toBe("u33db");
    expect(encodeGeohash({ lat: 48.8566, lon: 2.3522 }, 5)).toBe("u09tv"); // Paris
    expect(encodeGeohash({ lat: 0, lon: 0 }, 5)).toBe("s0000");
  });

  it("respektiert die gewünschte Präzision", () => {
    expect(encodeGeohash(BRANDENBURGER_TOR, 7)).toHaveLength(7);
    expect(encodeGeohash(BRANDENBURGER_TOR, 7).startsWith("u33db")).toBe(true);
  });
});

describe("geohashNeighborhood", () => {
  it("enthält die eigene Zelle", () => {
    const hood = geohashNeighborhood(BRANDENBURGER_TOR);
    expect(hood).toContain("u33db");
  });

  it("liefert maximal 9 eindeutige Zellen", () => {
    const hood = geohashNeighborhood(BRANDENBURGER_TOR);
    expect(hood.length).toBeGreaterThanOrEqual(4);
    expect(hood.length).toBeLessThanOrEqual(9);
    expect(new Set(hood).size).toBe(hood.length);
  });

  it("deckt einen nahen Punkt in einer Nachbarzelle ab", () => {
    // Punkt ~3 km östlich liegt in einer anderen Zelle, aber in der Nachbarschaft
    const east = { lat: 52.516275, lon: 13.42 };
    const hood = geohashNeighborhood(BRANDENBURGER_TOR);
    expect(hood).toContain(encodeGeohash(east, 5));
  });
});

describe("haversineDistanceMeters", () => {
  it("misst bekannte Distanzen mit <1% Abweichung", () => {
    const alexanderplatz = { lat: 52.521918, lon: 13.413215 };
    const d = haversineDistanceMeters(BRANDENBURGER_TOR, alexanderplatz);
    expect(d).toBeGreaterThan(2300);
    expect(d).toBeLessThan(2600);
  });

  it("ist symmetrisch und null bei identischen Punkten", () => {
    const a = BRANDENBURGER_TOR;
    const b = { lat: 52.5, lon: 13.4 };
    expect(haversineDistanceMeters(a, b)).toBeCloseTo(haversineDistanceMeters(b, a), 6);
    expect(haversineDistanceMeters(a, a)).toBe(0);
  });
});
