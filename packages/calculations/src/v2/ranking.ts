import Decimal from "decimal.js";

export type RankOrderStatus =
  "exact" | "tied" | "overlapping" | "indeterminate" | "not_eligible";

export interface CohortScenario {
  scores: Readonly<Record<string, string>>;
}

export interface ProjectRankBounds {
  projectId: string;
  rankMin: number | null;
  rankMax: number | null;
  rankOrderStatus: RankOrderStatus;
}

const scenarioRanks = (
  scenario: CohortScenario,
  projectIds: readonly string[],
): Map<string, { rank: number; tied: boolean }> => {
  const scores = projectIds.map((projectId) => {
    const value = scenario.scores[projectId];
    if (value === undefined)
      throw new Error(`Scenario is missing ${projectId}`);
    const score = new Decimal(value);
    if (!score.isFinite()) throw new Error(`Invalid score for ${projectId}`);
    return { projectId, score };
  });
  scores.sort(
    (left, right) =>
      right.score.comparedTo(left.score) ||
      left.projectId.localeCompare(right.projectId),
  );

  return new Map(
    scores.map((entry) => {
      const tied = scores.some(
        (candidate) =>
          candidate.projectId !== entry.projectId &&
          candidate.score.eq(entry.score),
      );
      const rank =
        scores.findIndex((candidate) => candidate.score.eq(entry.score)) + 1;
      return [entry.projectId, { rank, tied }];
    }),
  );
};

export function solveGlobalRankBounds(
  eligibleProjectIds: readonly string[],
  ineligibleProjectIds: readonly string[],
  feasibleScenarios: readonly CohortScenario[],
): ProjectRankBounds[] {
  const eligible = [...new Set(eligibleProjectIds)].sort();
  const ineligible = [...new Set(ineligibleProjectIds)].sort();
  if (eligible.some((projectId) => ineligible.includes(projectId))) {
    throw new Error("A project cannot be both eligible and ineligible");
  }

  const results: ProjectRankBounds[] = ineligible.map((projectId) => ({
    projectId,
    rankMin: null,
    rankMax: null,
    rankOrderStatus: "not_eligible",
  }));
  if (feasibleScenarios.length === 0) {
    return [
      ...results,
      ...eligible.map((projectId) => ({
        projectId,
        rankMin: null,
        rankMax: null,
        rankOrderStatus: "indeterminate" as const,
      })),
    ].sort((left, right) => left.projectId.localeCompare(right.projectId));
  }

  const ranks = feasibleScenarios.map((scenario) =>
    scenarioRanks(scenario, eligible),
  );
  for (const projectId of eligible) {
    const projectRanks = ranks.map((rank) => rank.get(projectId)!);
    const rankMin = Math.min(...projectRanks.map((rank) => rank.rank));
    const rankMax = Math.max(...projectRanks.map((rank) => rank.rank));
    const alwaysTied = projectRanks.every((rank) => rank.tied);
    const neverTied = projectRanks.every((rank) => !rank.tied);
    const rankOrderStatus: RankOrderStatus =
      rankMin !== rankMax
        ? "overlapping"
        : alwaysTied
          ? "tied"
          : neverTied
            ? "exact"
            : "indeterminate";
    results.push({ projectId, rankMin, rankMax, rankOrderStatus });
  }
  return results.sort((left, right) =>
    left.projectId.localeCompare(right.projectId),
  );
}
