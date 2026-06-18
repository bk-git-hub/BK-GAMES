export type RacingSimulationEntryInput = {
  raceEntryId: string;
  number: number;
};

export type BuildRacingSimulationInput = {
  seed: string;
  distanceM: number;
  runDurationMs: number;
  tickIntervalMs: number;
  elapsedMs: number;
  entries: RacingSimulationEntryInput[];
};

export type RacingSimulationPosition = {
  raceEntryId: string;
  progress: number;
  rank: number;
  distanceM: number;
  finishedAtMs: number | null;
};

export type RacingSimulationTick = {
  elapsedMs: number;
  positions: RacingSimulationPosition[];
};

export type RacingSimulationFinalEntry = {
  raceEntryId: string;
  finalRank: number;
  finishedAtMs: number;
};

type RacingSimulationState = RacingSimulationEntryInput & {
  distanceM: number;
  finishedAtMs: number | null;
};

const minimumRaceRunDurationMs = 1_000;
const minimumTickIntervalMs = 10;

export function buildRacingSimulationSeed(input: {
  raceId: string;
  raceNo: number;
}) {
  return `${input.raceId}:${input.raceNo}`;
}

export function buildRacingSimulationTick(
  input: BuildRacingSimulationInput,
): RacingSimulationTick {
  return simulateRacingPositions(input);
}

export function buildRacingSimulationFinal(
  input: Omit<BuildRacingSimulationInput, "elapsedMs">,
): RacingSimulationFinalEntry[] {
  const simulation = simulateRacingPositions({
    ...input,
    elapsedMs: input.runDurationMs,
  });

  return simulation.positions.map((position, index) => ({
    raceEntryId: position.raceEntryId,
    finalRank: index + 1,
    finishedAtMs: position.finishedAtMs ?? input.runDurationMs,
  }));
}

function simulateRacingPositions(
  input: BuildRacingSimulationInput,
): RacingSimulationTick {
  const seed = input.seed.trim();
  const distanceM = normalizePositiveNumber(input.distanceM, "distanceM");
  const runDurationMs = Math.max(
    minimumRaceRunDurationMs,
    normalizePositiveNumber(input.runDurationMs, "runDurationMs"),
  );
  const tickIntervalMs = Math.max(
    minimumTickIntervalMs,
    normalizePositiveNumber(input.tickIntervalMs, "tickIntervalMs"),
  );
  const elapsedMs = clamp(
    Math.floor(normalizeNonNegativeNumber(input.elapsedMs, "elapsedMs")),
    0,
    runDurationMs,
  );
  const states = input.entries.map((entry) => ({
    ...entry,
    distanceM: 0,
    finishedAtMs: null,
  }));
  let previousStepMs = 0;

  if (!seed) {
    throw new Error("Racing simulation seed is required.");
  }

  if (states.length === 0) {
    throw new Error("Racing simulation requires at least one entry.");
  }

  for (let step = 1; previousStepMs < elapsedMs; step += 1) {
    const stepEndMs = Math.min(step * tickIntervalMs, elapsedMs);
    const deltaMs = stepEndMs - previousStepMs;

    advanceSimulationStep({
      seed,
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

  const rankedStates = rankSimulationStates(states, distanceM);

  return {
    elapsedMs,
    positions: rankedStates.map((state, index) => ({
      raceEntryId: state.raceEntryId,
      progress: Number((state.distanceM / distanceM).toFixed(4)),
      rank: index + 1,
      distanceM: Number(state.distanceM.toFixed(3)),
      finishedAtMs:
        state.finishedAtMs === null ? null : Math.round(state.finishedAtMs),
    })),
  };
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
  const baseSpeedMPerMs = input.distanceM / input.runDurationMs;

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
  const earlyPace = lerp(0.78, 1.22, unitRandom(`${entrySeed}:early`));
  const latePace = lerp(0.82, 1.28, unitRandom(`${entrySeed}:late`));
  const stamina = lerp(0.72, 0.96, unitRandom(`${entrySeed}:stamina`));
  const phasePace = lerp(earlyPace, latePace, smoothStep(ratio));
  const tickNoise = lerp(
    -0.26,
    0.26,
    unitRandom(`${entrySeed}:tick:${input.step}`),
  );
  const burstRoll = unitRandom(`${entrySeed}:burst:${input.step}`);
  const stumbleRoll = unitRandom(`${entrySeed}:stumble:${input.step}`);
  const burst = burstRoll > 0.88 ? lerp(0.08, 0.34, burstRoll) : 0;
  const stumble = stumbleRoll < 0.08 ? -lerp(0.08, 0.3, 1 - stumbleRoll) : 0;
  const fatigue =
    ratio <= stamina ? 1 : Math.max(0.84, 1 - (ratio - stamina) * 0.46);
  let speedMPerMs =
    input.baseSpeedMPerMs *
    Math.max(0.28, phasePace + tickNoise + burst + stumble) *
    fatigue;

  const remainingMs = Math.max(1, input.runDurationMs - input.stepEndMs);
  const remainingM = Math.max(0, input.distanceM - input.state.distanceM);

  if (ratio >= 0.72 || remainingMs <= 8_000) {
    const requiredSpeedMPerMs = remainingM / remainingMs;
    const closingPush = lerp(
      1.01,
      1.08,
      unitRandom(`${entrySeed}:close:${input.step}`),
    );

    speedMPerMs = Math.max(speedMPerMs, requiredSpeedMPerMs * closingPush);
  }

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

function normalizePositiveNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }

  return value;
}

function normalizeNonNegativeNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }

  return value;
}
