import Decimal from "decimal.js";

export interface DecimalInterval {
  min: string;
  max: string;
}

export interface NamedInterval extends DecimalInterval {
  id: string;
}

const interval = (
  value: DecimalInterval,
  label: string,
  nonNegative = true,
): { min: Decimal; max: Decimal } => {
  const min = new Decimal(value.min);
  const max = new Decimal(value.max);
  if (!min.isFinite() || !max.isFinite() || min.gt(max)) {
    throw new Error(`Invalid ${label} interval`);
  }
  if (nonNegative && min.isNegative()) {
    throw new Error(`${label} must be non-negative`);
  }
  return { min, max };
};

const output = (value: { min: Decimal; max: Decimal }): DecimalInterval => ({
  min: value.min.toFixed(),
  max: value.max.toFixed(),
});

export interface ConservedCapitalBounds {
  event: DecimalInterval;
  allocations: readonly NamedInterval[];
  remainder: DecimalInterval;
}

export function tightenConservedCapitalBounds(
  bounds: ConservedCapitalBounds,
): ConservedCapitalBounds {
  const event = interval(bounds.event, "capital event");
  const allocations = bounds.allocations.map((allocation) => ({
    id: allocation.id,
    ...interval(allocation, `allocation ${allocation.id}`),
  }));
  const remainder = interval(bounds.remainder, "unallocated remainder");
  const minimumTotal = allocations
    .reduce((sum, allocation) => sum.add(allocation.min), remainder.min)
    .toDecimalPlaces(18);
  const maximumTotal = allocations
    .reduce((sum, allocation) => sum.add(allocation.max), remainder.max)
    .toDecimalPlaces(18);

  if (minimumTotal.gt(event.max) || maximumTotal.lt(event.min)) {
    throw new Error("Capital allocation bounds are infeasible");
  }

  const tightenedAllocations = allocations.map((allocation, index) => {
    const otherMinimum = allocations.reduce(
      (sum, candidate, candidateIndex) =>
        candidateIndex === index ? sum : sum.add(candidate.min),
      remainder.min,
    );
    const otherMaximum = allocations.reduce(
      (sum, candidate, candidateIndex) =>
        candidateIndex === index ? sum : sum.add(candidate.max),
      remainder.max,
    );
    const min = Decimal.max(allocation.min, event.min.sub(otherMaximum));
    const max = Decimal.min(allocation.max, event.max.sub(otherMinimum));
    if (min.gt(max))
      throw new Error("Capital allocation bounds are infeasible");
    return { id: allocation.id, ...output({ min, max }) };
  });

  const allocationMinimum = allocations.reduce(
    (sum, allocation) => sum.add(allocation.min),
    new Decimal(0),
  );
  const allocationMaximum = allocations.reduce(
    (sum, allocation) => sum.add(allocation.max),
    new Decimal(0),
  );
  const tightenedRemainder = {
    min: Decimal.max(remainder.min, event.min.sub(allocationMaximum)),
    max: Decimal.min(remainder.max, event.max.sub(allocationMinimum)),
  };
  if (tightenedRemainder.min.gt(tightenedRemainder.max)) {
    throw new Error("Capital allocation bounds are infeasible");
  }

  return {
    event: output(event),
    allocations: tightenedAllocations,
    remainder: output(tightenedRemainder),
  };
}

export function isConservedCapitalScenario(
  eventAmount: string,
  allocations: Readonly<Record<string, string>>,
  remainderAmount: string,
  evidenceBounds: ConservedCapitalBounds,
): boolean {
  const event = new Decimal(eventAmount);
  const eventBounds = interval(evidenceBounds.event, "capital event");
  const remainder = new Decimal(remainderAmount);
  const remainderBounds = interval(evidenceBounds.remainder, "remainder");
  if (
    !event.isFinite() ||
    event.lt(eventBounds.min) ||
    event.gt(eventBounds.max) ||
    !remainder.isFinite() ||
    remainder.lt(remainderBounds.min) ||
    remainder.gt(remainderBounds.max)
  ) {
    return false;
  }

  let total = remainder;
  for (const bound of evidenceBounds.allocations) {
    const amountText = allocations[bound.id];
    if (amountText === undefined) return false;
    const amount = new Decimal(amountText);
    const allowed = interval(bound, `allocation ${bound.id}`);
    if (
      !amount.isFinite() ||
      amount.lt(allowed.min) ||
      amount.gt(allowed.max)
    ) {
      return false;
    }
    total = total.add(amount);
  }
  return (
    Object.keys(allocations).length === evidenceBounds.allocations.length &&
    total.eq(event)
  );
}

export interface AffiliatedCirculatingInput {
  walletBalance: DecimalInterval;
  affiliatedFraction: DecimalInterval;
  circulatingInclusionFraction: DecimalInterval;
  circulatingUnits: string;
}

export function calculateAffiliatedCirculatingUnits(
  input: AffiliatedCirculatingInput,
): DecimalInterval {
  const balance = interval(input.walletBalance, "wallet balance");
  const affiliated = interval(input.affiliatedFraction, "affiliated fraction");
  const included = interval(
    input.circulatingInclusionFraction,
    "circulating inclusion fraction",
  );
  if (affiliated.max.gt(1) || included.max.gt(1)) {
    throw new Error("Ownership fractions cannot exceed one");
  }
  const circulatingUnits = new Decimal(input.circulatingUnits);
  if (!circulatingUnits.isFinite() || circulatingUnits.isNegative()) {
    throw new Error("Circulating units must be non-negative");
  }
  const min = balance.min.mul(affiliated.min).mul(included.min);
  const unconstrainedMax = balance.max.mul(affiliated.max).mul(included.max);
  if (min.gt(circulatingUnits)) {
    throw new Error(
      "Affiliated circulating minimum exceeds circulating supply",
    );
  }
  return output({ min, max: Decimal.min(unconstrainedMax, circulatingUnits) });
}

export interface ProjectScoreBoundsInput {
  circulatingValue: DecimalInterval;
  affiliatedValue: DecimalInterval;
  qualifyingCapital: DecimalInterval;
}

export function calculateProjectScoreBounds(
  input: ProjectScoreBoundsInput,
): DecimalInterval {
  const circulating = interval(input.circulatingValue, "circulating value");
  const affiliated = interval(input.affiliatedValue, "affiliated value");
  const capital = interval(input.qualifyingCapital, "qualifying capital");
  return output({
    min: circulating.min.sub(affiliated.max).sub(capital.max),
    max: circulating.max.sub(affiliated.min).sub(capital.min),
  });
}
