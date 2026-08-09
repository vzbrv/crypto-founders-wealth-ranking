import Decimal from "decimal.js";

export interface TimedObservation {
  id: string;
  assetId: string;
  observedAt: string;
  knownAt: string;
}

export interface PriceObservation extends TimedObservation {
  price: string;
  quoteCurrency: "USD";
}

export interface SupplyObservation extends TimedObservation {
  circulatingUnits: string;
}

export interface SnapshotCutoffs {
  economicAsOf: string;
  knowledgeCutoff: string;
}

const time = (value: string): number => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid timestamp: ${value}`);
  return parsed;
};

export function selectLatestAsOf<T extends TimedObservation>(
  observations: readonly T[],
  cutoffs: SnapshotCutoffs,
): Map<string, T> {
  const economicAsOf = time(cutoffs.economicAsOf);
  const knowledgeCutoff = time(cutoffs.knowledgeCutoff);
  const selected = new Map<string, T>();

  for (const observation of observations) {
    const observedAt = time(observation.observedAt);
    const knownAt = time(observation.knownAt);
    if (observedAt > economicAsOf || knownAt > knowledgeCutoff) continue;

    const current = selected.get(observation.assetId);
    if (
      !current ||
      observedAt > time(current.observedAt) ||
      (observedAt === time(current.observedAt) &&
        knownAt > time(current.knownAt)) ||
      (observedAt === time(current.observedAt) &&
        knownAt === time(current.knownAt) &&
        observation.id.localeCompare(current.id) > 0)
    ) {
      selected.set(observation.assetId, observation);
    }
  }

  return selected;
}

export function calculateCirculatingMarketValue(
  price: PriceObservation,
  supply: SupplyObservation,
): string {
  if (price.assetId !== supply.assetId)
    throw new Error("Price and supply assets differ");
  const normalizedPrice = new Decimal(price.price);
  const circulatingUnits = new Decimal(supply.circulatingUnits);
  if (normalizedPrice.isNegative() || circulatingUnits.isNegative()) {
    throw new Error("Price and circulating supply must be non-negative");
  }
  return normalizedPrice.mul(circulatingUnits).toFixed();
}

export interface CanonicalRepresentation {
  assetId: string;
  canonicalAssetId: string;
  circulatingUnits: string;
  backingUnits: string;
}

export function consolidateCanonicalSupply(
  representations: readonly CanonicalRepresentation[],
): Map<string, string> {
  const totals = new Map<string, Decimal>();
  for (const item of representations) {
    const circulating = new Decimal(item.circulatingUnits);
    const backing = new Decimal(item.backingUnits);
    if (
      circulating.isNegative() ||
      backing.isNegative() ||
      circulating.gt(backing)
    ) {
      throw new Error(
        `Representation ${item.assetId} exceeds canonical backing`,
      );
    }
    totals.set(
      item.canonicalAssetId,
      (totals.get(item.canonicalAssetId) ?? new Decimal(0)).add(circulating),
    );
  }
  return new Map(
    [...totals].map(([assetId, total]) => [assetId, total.toFixed()]),
  );
}
