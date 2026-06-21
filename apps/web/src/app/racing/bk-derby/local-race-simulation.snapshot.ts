// Snapshot of the current BK Derby client-side race model for a future local PWA mode.
export const localRaceSimulationDefaults = {
  maxUnforcedRaceDurationMultiplier: 2.2,
  maxVisualRaceProgress: 1.075,
  minimumRaceRunDurationMs: 1_000,
  minimumTickIntervalMs: 10,
  postFinishTrackOvershootRatio: 0.075,
  visualRaceSpeedMultiplier: 1.7,
} as const;

export type LocalRaceSimulationEntry = {
  number: number;
  raceEntryId: string;
};

export type LocalRaceSimulationPosition = {
  finishedAtMs: number | null;
  progress: number;
  raceEntryId: string;
  rank: number;
};

export type LocalRaceTimeline = {
  maxElapsedMs: number;
  snapshots: LocalRaceSimulationPosition[][];
  tickIntervalMs: number;
};

type LocalRaceSimulationState = LocalRaceSimulationEntry & {
  distanceM: number;
  finishedAtMs: number | null;
  finishSpeedMPerMs: number | null;
};

export type BuildLocalRaceTimelineInput = {
  distanceM: number;
  entries: LocalRaceSimulationEntry[];
  runDurationMs: number;
  seed: string;
  tickIntervalMs: number;
};

export type ReadLocalRaceTimelineTickInput = BuildLocalRaceTimelineInput & {
  elapsedMs: number;
};

const minimumRaceRunDurationMs =
  localRaceSimulationDefaults.minimumRaceRunDurationMs;
const minimumTickIntervalMs = localRaceSimulationDefaults.minimumTickIntervalMs;
const maxUnforcedRaceDurationMultiplier =
  localRaceSimulationDefaults.maxUnforcedRaceDurationMultiplier;
const postFinishTrackOvershootRatio =
  localRaceSimulationDefaults.postFinishTrackOvershootRatio;
const maxVisualRaceProgress = localRaceSimulationDefaults.maxVisualRaceProgress;

export function buildLocalRaceSimulationSeed(input: {
  raceId: string;
  raceNo: number;
}) {
  return `${input.raceId}:${input.raceNo}`;
}

export function readLocalRaceTimelineTick(
  input: ReadLocalRaceTimelineTickInput,
) {
  const timeline = buildLocalRaceTimeline(input);
  const elapsedMs = clamp(input.elapsedMs, 0, timeline.maxElapsedMs);
  const snapshotIndex = Math.min(
    timeline.snapshots.length - 1,
    Math.floor(elapsedMs / timeline.tickIntervalMs),
  );

  return timeline.snapshots[snapshotIndex] ?? [];
}

export function buildLocalRaceTimeline(
  input: BuildLocalRaceTimelineInput,
): LocalRaceTimeline {
  const distanceM = input.distanceM;
  const runDurationMs = Math.max(minimumRaceRunDurationMs, input.runDurationMs);
  const maxElapsedMs = runDurationMs * maxUnforcedRaceDurationMultiplier;
  const tickIntervalMs = Math.max(minimumTickIntervalMs, input.tickIntervalMs);
  const states = input.entries.map((entry) => ({
    distanceM: 0,
    finishedAtMs: null,
    finishSpeedMPerMs: null,
    number: entry.number,
    raceEntryId: entry.raceEntryId,
  }));
  const snapshots: LocalRaceSimulationPosition[][] = [
    snapshotSimulationStates(states, distanceM),
  ];
  let previousStepMs = 0;

  for (let step = 1; previousStepMs < maxElapsedMs; step += 1) {
    const stepEndMs = Math.min(step * tickIntervalMs, maxElapsedMs);
    const deltaMs = stepEndMs - previousStepMs;

    advanceSimulationStep({
      deltaMs,
      distanceM,
      runDurationMs,
      seed: input.seed,
      states,
      step,
      stepEndMs,
      stepStartMs: previousStepMs,
    });

    snapshots.push(snapshotSimulationStates(states, distanceM));
    previousStepMs = stepEndMs;
  }

  return {
    maxElapsedMs,
    snapshots,
    tickIntervalMs,
  };
}

function snapshotSimulationStates(
  states: LocalRaceSimulationState[],
  distanceM: number,
) {
  return rankSimulationStates(states, distanceM).map((state, index) => ({
    finishedAtMs:
      state.finishedAtMs === null ? null : Math.round(state.finishedAtMs),
    progress: Number((state.distanceM / distanceM).toFixed(4)),
    raceEntryId: state.raceEntryId,
    rank: index + 1,
  }));
}

function advanceSimulationStep(input: {
  deltaMs: number;
  distanceM: number;
  runDurationMs: number;
  seed: string;
  states: LocalRaceSimulationState[];
  step: number;
  stepEndMs: number;
  stepStartMs: number;
}) {
  const baseSpeedMPerMs = input.distanceM / input.runDurationMs;

  for (const state of input.states) {
    if (state.finishedAtMs !== null) {
      state.distanceM = getPostFinishDistance({
        distanceM: input.distanceM,
        finishedAtMs: state.finishedAtMs,
        finishSpeedMPerMs: state.finishSpeedMPerMs ?? baseSpeedMPerMs,
        stepEndMs: input.stepEndMs,
      });
      continue;
    }

    const previousDistanceM = state.distanceM;
    const speedMPerMs = calculateStepSpeed({
      baseSpeedMPerMs,
      distanceM: input.distanceM,
      runDurationMs: input.runDurationMs,
      seed: input.seed,
      state,
      step: input.step,
      stepEndMs: input.stepEndMs,
    });
    const nextDistanceM = Math.min(
      input.distanceM,
      previousDistanceM + speedMPerMs * input.deltaMs,
    );

    if (
      nextDistanceM >= input.distanceM &&
      previousDistanceM < input.distanceM
    ) {
      const travelledM = nextDistanceM - previousDistanceM;
      const crossingRatio =
        travelledM <= 0
          ? 1
          : (input.distanceM - previousDistanceM) / travelledM;

      state.finishedAtMs =
        input.stepStartMs + clamp(crossingRatio, 0, 1) * input.deltaMs;
      state.finishSpeedMPerMs = speedMPerMs;
    }

    state.distanceM =
      state.finishedAtMs === null
        ? nextDistanceM
        : getPostFinishDistance({
            distanceM: input.distanceM,
            finishedAtMs: state.finishedAtMs,
            finishSpeedMPerMs: state.finishSpeedMPerMs ?? speedMPerMs,
            stepEndMs: input.stepEndMs,
          });
  }
}

function getPostFinishDistance(input: {
  distanceM: number;
  finishedAtMs: number;
  finishSpeedMPerMs: number;
  stepEndMs: number;
}) {
  const postFinishElapsedMs = Math.max(0, input.stepEndMs - input.finishedAtMs);
  const maxPostFinishDistanceM =
    input.distanceM * postFinishTrackOvershootRatio;
  const postFinishDistanceM = Math.min(
    maxPostFinishDistanceM,
    input.finishSpeedMPerMs * postFinishElapsedMs,
  );

  return input.distanceM + postFinishDistanceM;
}

function calculateStepSpeed(input: {
  baseSpeedMPerMs: number;
  distanceM: number;
  runDurationMs: number;
  seed: string;
  state: LocalRaceSimulationState;
  step: number;
  stepEndMs: number;
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
  states: LocalRaceSimulationState[],
  distanceM: number,
) {
  const maxVisualDistanceM = distanceM * maxVisualRaceProgress;

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
      distanceM: Math.min(maxVisualDistanceM, state.distanceM),
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
