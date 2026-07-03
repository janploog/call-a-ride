import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING, estimateFareCents, splitFare } from "./pricing";

describe("estimateFareCents", () => {
  it("berechnet Grundpreis + Distanz + Zeit", () => {
    // 5 km, 10 min: 300 + 5*150 + 10*30 = 1350
    expect(estimateFareCents(5000, 600)).toBe(1350);
  });

  it("wendet den Mindestfahrpreis an", () => {
    // 500 m, 2 min: 300 + 75 + 60 = 435 → Minimum 700
    expect(estimateFareCents(500, 120)).toBe(700);
  });

  it("rundet auf ganze Cents", () => {
    const fare = estimateFareCents(3333, 333);
    expect(Number.isInteger(fare)).toBe(true);
  });

  it("lehnt negative Eingaben ab", () => {
    expect(() => estimateFareCents(-1, 60)).toThrow(RangeError);
    expect(() => estimateFareCents(1000, -1)).toThrow(RangeError);
  });
});

describe("splitFare", () => {
  it("teilt in Provision und Fahrer-Auszahlung ohne Rundungsverlust", () => {
    const { totalCents, platformFeeCents, driverPayoutCents } = splitFare(1350);
    expect(platformFeeCents).toBe(270); // 20 %
    expect(driverPayoutCents).toBe(1080);
    expect(platformFeeCents + driverPayoutCents).toBe(totalCents);
  });

  it("bleibt auch bei ungeraden Beträgen verlustfrei", () => {
    const { totalCents, platformFeeCents, driverPayoutCents } = splitFare(999, {
      ...DEFAULT_PRICING,
      commissionRate: 0.15,
    });
    expect(platformFeeCents + driverPayoutCents).toBe(totalCents);
  });
});
