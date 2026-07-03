/**
 * Preislogik als reine Funktionen: in der App für die Vorab-Schätzung,
 * im Backend verbindlich. Alle Beträge in Euro-Cent (Integer) — niemals Floats für Geld.
 */

export interface PricingConfig {
  baseFareCents: number;
  perKmCents: number;
  perMinuteCents: number;
  minimumFareCents: number;
  /** Plattform-Provision als Anteil, z. B. 0.20 für 20 % */
  commissionRate: number;
}

export const DEFAULT_PRICING: PricingConfig = {
  baseFareCents: 300,
  perKmCents: 150,
  perMinuteCents: 30,
  minimumFareCents: 700,
  commissionRate: 0.2,
};

export interface FareBreakdown {
  totalCents: number;
  platformFeeCents: number;
  driverPayoutCents: number;
}

export function estimateFareCents(
  distanceMeters: number,
  durationSeconds: number,
  config: PricingConfig = DEFAULT_PRICING,
): number {
  if (distanceMeters < 0 || durationSeconds < 0) {
    throw new RangeError("distance and duration must be non-negative");
  }
  const distanceComponent = Math.round((distanceMeters / 1000) * config.perKmCents);
  const timeComponent = Math.round((durationSeconds / 60) * config.perMinuteCents);
  const raw = config.baseFareCents + distanceComponent + timeComponent;
  return Math.max(raw, config.minimumFareCents);
}

export function splitFare(
  totalCents: number,
  config: PricingConfig = DEFAULT_PRICING,
): FareBreakdown {
  const platformFeeCents = Math.round(totalCents * config.commissionRate);
  return {
    totalCents,
    platformFeeCents,
    driverPayoutCents: totalCents - platformFeeCents,
  };
}
