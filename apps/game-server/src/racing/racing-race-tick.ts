import type {
  RacingRaceTickSnapshot,
  RacingTableState,
} from '@bk-games/shared';

export function buildRaceTick(state: RacingTableState): RacingRaceTickSnapshot {
  const race = state.race;

  if (!race) {
    throw new Error('No active race.');
  }

  const raceRunDurationMs = Math.max(
    1_000,
    (state.timing.raceAndResultSeconds - state.timing.roundEndDelaySeconds) *
      1000,
  );
  const startAt =
    Date.parse(race.startedAt ?? '') ||
    Date.parse(race.scheduledStartAt ?? '') ||
    Date.now();
  const elapsedMs = Math.max(
    0,
    Math.min(Date.now() - startAt, raceRunDurationMs),
  );
  const elapsedRatio = elapsedMs / raceRunDurationMs;
  const positions = race.entries
    .map((entry) => {
      const score = deterministicRaceScore({
        raceId: race.raceId,
        raceNo: race.raceNo,
        raceEntryId: entry.raceEntryId,
        number: entry.number,
      });

      return {
        raceEntryId: entry.raceEntryId,
        score,
      };
    })
    .sort((left, right) => right.score - left.score)
    .map((entry, index) => {
      const finishProgress = Math.max(0.9, 0.995 - index * 0.003);
      const speedFactor = Math.max(0.9, 1.05 - index * 0.015);
      const progress = Math.min(
        finishProgress,
        Math.max(0, elapsedRatio * speedFactor),
      );

      return {
        raceEntryId: entry.raceEntryId,
        progress: Number(progress.toFixed(4)),
        rank: index + 1,
      };
    });

  return {
    raceId: race.raceId,
    elapsedMs,
    positions,
  };
}

function deterministicRaceScore(input: {
  raceId: string;
  raceNo: number;
  raceEntryId: string;
  number: number;
}) {
  return deterministicScore(
    `${input.raceId}:${input.raceNo}:${input.raceEntryId}:${input.number}`,
  );
}

function deterministicScore(seed: string) {
  let hash = 2_166_136_261;

  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}
