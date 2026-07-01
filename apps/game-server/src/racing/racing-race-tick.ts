import type {
  RacingRaceEntrySnapshot,
  RacingRaceTickSnapshot,
  RacingTableState,
} from '@bk-games/shared';

type RacingSimulationState = {
  raceEntryId: string;
  number: number;
  distanceM: number;
  finishedAtMs: number | null;
};

const minimumRaceRunDurationMs = 1_000;
const minimumTickIntervalMs = 10;
// Keep natural pace faster than the race window so visual ticks do not need a hard deadline push.
const naturalFinishPaceRatio = 0.82;

export function buildRaceTick(state: RacingTableState): RacingRaceTickSnapshot {
  const race = state.race;

  if (!race) {
    throw new Error('No active race.');
  }

  const raceRunDurationMs = Math.max(
    minimumRaceRunDurationMs,
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
  const positions = simulateRaceTick({
    seed: buildSimulationSeed({
      raceId: race.raceId,
      raceNo: race.raceNo,
    }),
    distanceM: state.timing.raceDistanceM,
    runDurationMs: raceRunDurationMs,
    tickIntervalMs: state.timing.tickIntervalMs,
    elapsedMs,
    entries: race.entries,
  });

  return {
    raceId: race.raceId,
    elapsedMs,
    positions: positions.map((position) => ({
      raceEntryId: position.raceEntryId,
      progress: position.progress,
      rank: position.rank,
    })),
  };
}

function buildSimulationSeed(input: { raceId: string; raceNo: number }) {
  return `${input.raceId}:${input.raceNo}`;
}

function simulateRaceTick(input: {
  seed: string;
  distanceM: number;
  runDurationMs: number;
  tickIntervalMs: number;
  elapsedMs: number;
  entries: RacingRaceEntrySnapshot[];
}) {
  const distanceM = input.distanceM;
  const runDurationMs = Math.max(minimumRaceRunDurationMs, input.runDurationMs);
  const tickIntervalMs = Math.max(minimumTickIntervalMs, input.tickIntervalMs);
  const elapsedMs = Math.max(0, Math.min(input.elapsedMs, runDurationMs));
  const states = input.entries.map((entry) => ({
    raceEntryId: entry.raceEntryId,
    number: entry.number,
    distanceM: 0,
    finishedAtMs: null,
  }));
  let previousStepMs = 0;

  for (let step = 1; previousStepMs < elapsedMs; step += 1) {
    const stepEndMs = Math.min(step * tickIntervalMs, elapsedMs);
    const deltaMs = stepEndMs - previousStepMs;

    advanceSimulationStep({
      seed: input.seed,
      states,
      step,
      stepStartMs: previousStepMs,
      stepEndMs,
      deltaMs,
      distanceM,
      runDurationMs,
    });

    previousStepMs = stepEndMs;
  }

  return rankSimulationStates(states, distanceM).map((state, index) => ({
    raceEntryId: state.raceEntryId,
    progress: Number((state.distanceM / distanceM).toFixed(4)),
    rank: index + 1,
  }));
}

function advanceSimulationStep(input: {
  seed: string;
  states: RacingSimulationState[];
  step: number;
  stepStartMs: number;
  stepEndMs: number;
  deltaMs: number;
  distanceM: number;
  runDurationMs: number;
}) {
  const baseSpeedMPerMs =
    input.distanceM / (input.runDurationMs * naturalFinishPaceRatio);

  for (const state of input.states) {
    if (state.finishedAtMs !== null) {
      state.distanceM = input.distanceM;
      continue;
    }

    const previousDistanceM = state.distanceM;
    const speedMPerMs = calculateStepSpeed({
      seed: input.seed,
      state,
      step: input.step,
      stepEndMs: input.stepEndMs,
      distanceM: input.distanceM,
      runDurationMs: input.runDurationMs,
      baseSpeedMPerMs,
    });
    const rawNextDistanceM = previousDistanceM + speedMPerMs * input.deltaMs;
    const nextDistanceM = Math.min(input.distanceM, rawNextDistanceM);

    if (
      rawNextDistanceM >= input.distanceM &&
      previousDistanceM < input.distanceM
    ) {
      const travelledM = rawNextDistanceM - previousDistanceM;
      const crossingRatio =
        travelledM <= 0
          ? 1
          : (input.distanceM - previousDistanceM) / travelledM;

      state.finishedAtMs =
        input.stepStartMs + clamp(crossingRatio, 0, 1) * input.deltaMs;
    }

    state.distanceM = nextDistanceM;
  }
}

function calculateStepSpeed(input: {
  seed: string;
  state: RacingSimulationState;
  step: number;
  stepEndMs: number;
  distanceM: number;
  runDurationMs: number;
  baseSpeedMPerMs: number;
}) {
  const ratio = input.stepEndMs / input.runDurationMs;
  const entrySeed = `${input.seed}:${input.state.raceEntryId}:${input.state.number}`;
  const earlyPace = lerp(0.88, 1.14, unitRandom(`${entrySeed}:early`));
  const latePace = lerp(0.9, 1.18, unitRandom(`${entrySeed}:late`));
  const stamina = lerp(0.78, 0.94, unitRandom(`${entrySeed}:stamina`));
  const phasePace = lerp(earlyPace, latePace, smoothStep(ratio));
  const tickNoise = lerp(
    -0.18,
    0.18,
    unitRandom(`${entrySeed}:tick:${input.step}`),
  );
  const burstRoll = unitRandom(`${entrySeed}:burst:${input.step}`);
  const stumbleRoll = unitRandom(`${entrySeed}:stumble:${input.step}`);
  const burst = burstRoll > 0.91 ? lerp(0.05, 0.22, burstRoll) : 0;
  const stumble = stumbleRoll < 0.055 ? -lerp(0.05, 0.18, 1 - stumbleRoll) : 0;
  const fatigue =
    ratio <= stamina ? 1 : Math.max(0.88, 1 - (ratio - stamina) * 0.34);
  const speedMPerMs =
    input.baseSpeedMPerMs *
    Math.max(0.28, phasePace + tickNoise + burst + stumble) *
    fatigue;
  return speedMPerMs;
}

function rankSimulationStates(
  states: RacingSimulationState[],
  distanceM: number,
) {
  return [...states]
    .sort((left, right) => {
      if (left.finishedAtMs !== null || right.finishedAtMs !== null) {
        if (left.finishedAtMs === null) {
          return 1;
        }

        if (right.finishedAtMs === null) {
          return -1;
        }

        if (left.finishedAtMs !== right.finishedAtMs) {
          return left.finishedAtMs - right.finishedAtMs;
        }
      }

      if (left.distanceM !== right.distanceM) {
        return right.distanceM - left.distanceM;
      }

      if (left.number !== right.number) {
        return left.number - right.number;
      }

      return left.raceEntryId.localeCompare(right.raceEntryId);
    })
    .map((state) => ({
      ...state,
      distanceM: Math.min(distanceM, state.distanceM),
    }));
}

function deterministicScore(seed: string) {
  let hash = 2_166_136_261;

  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

function unitRandom(seed: string) {
  return deterministicScore(seed) / 0xffffffff;
}

function lerp(start: number, end: number, ratio: number) {
  return start + (end - start) * ratio;
}

function smoothStep(ratio: number) {
  const value = clamp(ratio, 0, 1);

  return value * value * (3 - 2 * value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
