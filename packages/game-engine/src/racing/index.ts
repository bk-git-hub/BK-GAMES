export const racingEngineVersion = "racing-engine-v1";

export type RacingHorseStateLabel =
  | "BREAK"
  | "EARLY_PUSH"
  | "CRUISING"
  | "CHASING"
  | "WIDE_TURN"
  | "LATE_SURGE"
  | "FADING"
  | "FINISHED";

export type RacingEventType =
  | "CLEAN_BREAK"
  | "SLOW_BREAK"
  | "EARLY_PUSH"
  | "SETTLE_BACK"
  | "WIDE_TURN"
  | "CLEAR_LANE"
  | "LATE_SURGE"
  | "FADE";

export type RacingRacePhase = "RUNNING" | "FINISHED";

export type RacingHorseEntry = {
  horseId: string;
  number: number;
  name: string;
  silkColor: string;
  gateNo: number;
};

export type RacingHorseProfile = {
  startReaction: number;
  earlyPace: number;
  midPace: number;
  turnHandling: number;
  lateKick: number;
  stamina: number;
  volatility: number;
};

export type RacingEventState = {
  type: RacingEventType;
  startedAtMs: number;
  durationMs: number;
  targetPower: number;
  currentPower: number;
};

export type RacingScheduledEvent = {
  type: RacingEventType;
  startProgress: number;
  durationMs: number;
  targetPower: number;
  startedAtMs: number | null;
};

export type RacingHorseState = {
  horseId: string;
  number: number;
  name: string;
  silkColor: string;
  gateNo: number;
  lane: number;
  positionM: number;
  speedMps: number;
  targetSpeedMps: number;
  rank: number;
  effort: number;
  smoothNoise: number;
  currentEvent: RacingEventState | null;
  eventSchedule: RacingScheduledEvent[];
  profile: RacingHorseProfile;
  finishedAtMs: number | null;
  stateLabel: RacingHorseStateLabel;
  tieBreaker: number;
};

export type RacingRaceState = {
  seed: string;
  rngState: number;
  phase: RacingRacePhase;
  tick: number;
  elapsedMs: number;
  tickIntervalMs: number;
  distanceM: number;
  accelerationLimitMps2: number;
  fieldSize: number;
  horses: RacingHorseState[];
  finishOrder: string[];
};

export type CreateRacingRaceInput = {
  seed: string;
  entries: RacingHorseEntry[];
  raceDistanceM?: number;
  tickIntervalMs?: number;
  accelerationLimitMps2?: number;
};

export type SimulateRacingRaceInput = CreateRacingRaceInput & {
  maxTicks?: number;
};

const defaultRaceDistanceM = 1200;
const defaultTickIntervalMs = 100;
const defaultAccelerationLimitMps2 = 5;
const defaultMaxTicks = 2_000;

export function createRacingRace(input: CreateRacingRaceInput): RacingRaceState {
  const entries = normalizeEntries(input.entries);
  let rngState = hashSeed(input.seed);
  const horses: RacingHorseState[] = [];

  for (const [index, entry] of entries.entries()) {
    const profileResult = sampleProfile(rngState);
    rngState = profileResult.rngState;
    const eventResult = sampleEventSchedule(rngState);
    rngState = eventResult.rngState;
    const tieBreakerResult = nextRandom(rngState);
    rngState = tieBreakerResult.rngState;

    horses.push({
      horseId: entry.horseId,
      number: entry.number,
      name: entry.name,
      silkColor: entry.silkColor,
      gateNo: entry.gateNo,
      lane: index + 1,
      positionM: 0,
      speedMps: 0,
      targetSpeedMps: 0,
      rank: index + 1,
      effort: 0,
      smoothNoise: 0,
      currentEvent: null,
      eventSchedule: eventResult.events,
      profile: profileResult.profile,
      finishedAtMs: null,
      stateLabel: "BREAK",
      tieBreaker: tieBreakerResult.value,
    });
  }

  return {
    seed: input.seed,
    rngState,
    phase: "RUNNING",
    tick: 0,
    elapsedMs: 0,
    tickIntervalMs: normalizePositiveInteger(
      input.tickIntervalMs ?? defaultTickIntervalMs,
      "tickIntervalMs",
    ),
    distanceM: normalizePositiveNumber(
      input.raceDistanceM ?? defaultRaceDistanceM,
      "raceDistanceM",
    ),
    accelerationLimitMps2: normalizePositiveNumber(
      input.accelerationLimitMps2 ?? defaultAccelerationLimitMps2,
      "accelerationLimitMps2",
    ),
    fieldSize: entries.length,
    horses,
    finishOrder: [],
  };
}

export function advanceRacingRaceTick(
  state: RacingRaceState,
): RacingRaceState {
  if (state.phase === "FINISHED") {
    return state;
  }

  const dt = state.tickIntervalMs / 1000;
  const nextElapsedMs = state.elapsedMs + state.tickIntervalMs;
  let rngState = state.rngState;
  const updatedHorses = state.horses.map((horse) => {
    if (horse.finishedAtMs !== null) {
      return horse;
    }

    const noiseResult = nextRandom(rngState);
    rngState = noiseResult.rngState;
    const smoothNoise =
      horse.smoothNoise * 0.92 +
      (noiseResult.value * 2 - 1) * 0.08 * horse.profile.volatility;
    const progress = horse.positionM / state.distanceM;
    const eventUpdate = updateEventState(horse, progress, state.elapsedMs, dt);
    const eventModifier = eventUpdate.currentEvent?.currentPower ?? 0;
    const targetSpeedMps = calculateTargetSpeed({
      eventModifier,
      horse,
      progress,
      smoothNoise,
    });
    const speedMps = moveToward(
      horse.speedMps,
      targetSpeedMps,
      state.accelerationLimitMps2 * dt,
    );
    const effort =
      horse.effort + Math.max(0, speedMps - comfortableSpeedMps) * dt;
    const previousPositionM = horse.positionM;
    const positionM = Math.min(state.distanceM, previousPositionM + speedMps * dt);
    const finishedAtMs =
      positionM >= state.distanceM
        ? estimateFinishedAtMs({
            elapsedMs: state.elapsedMs,
            previousPositionM,
            speedMps,
            distanceM: state.distanceM,
          })
        : null;

    return {
      ...horse,
      positionM,
      speedMps,
      targetSpeedMps,
      rank: horse.rank,
      effort,
      smoothNoise,
      currentEvent: eventUpdate.currentEvent,
      eventSchedule: eventUpdate.eventSchedule,
      finishedAtMs,
      stateLabel: getStateLabel({
        currentEvent: eventUpdate.currentEvent,
        finishedAtMs,
        progress: positionM / state.distanceM,
        speedMps,
      }),
    };
  });
  const rankedHorses = assignRanks(updatedHorses);
  const finishOrder = rankedHorses
    .filter((horse) => horse.finishedAtMs !== null)
    .sort(compareRacePosition)
    .map((horse) => horse.horseId);
  const finished = rankedHorses.every((horse) => horse.finishedAtMs !== null);

  return {
    ...state,
    rngState,
    phase: finished ? "FINISHED" : "RUNNING",
    tick: state.tick + 1,
    elapsedMs: nextElapsedMs,
    horses: rankedHorses,
    finishOrder,
  };
}

export function simulateRacingRace(
  input: SimulateRacingRaceInput,
): RacingRaceState {
  let state = createRacingRace(input);
  const maxTicks = input.maxTicks ?? defaultMaxTicks;

  for (let tick = 0; tick < maxTicks && state.phase !== "FINISHED"; tick += 1) {
    state = advanceRacingRaceTick(state);
  }

  if (state.phase !== "FINISHED") {
    throw new Error(
      `Race did not finish within ${maxTicks} ticks for seed ${input.seed}.`,
    );
  }

  return state;
}

export function createRacingEntries(fieldSize: number): RacingHorseEntry[] {
  const normalizedFieldSize = normalizeFieldSize(fieldSize);

  return Array.from({ length: normalizedFieldSize }, (_, index) => {
    const number = index + 1;

    return {
      horseId: `horse-${number}`,
      number,
      name: `BK Runner ${number}`,
      silkColor: defaultSilkColors[index % defaultSilkColors.length] ?? "#ffffff",
      gateNo: number,
    };
  });
}

function normalizeEntries(entries: readonly RacingHorseEntry[]) {
  const fieldSize = normalizeFieldSize(entries.length);
  const seenHorseIds = new Set<string>();
  const seenNumbers = new Set<number>();
  const seenGateNos = new Set<number>();

  return entries.map((entry, index) => {
    const horseId = entry.horseId.trim();
    const name = entry.name.trim();
    const silkColor = entry.silkColor.trim();

    if (!horseId) {
      throw new Error(`entries[${index}].horseId is required.`);
    }

    if (!name) {
      throw new Error(`entries[${index}].name is required.`);
    }

    if (!silkColor) {
      throw new Error(`entries[${index}].silkColor is required.`);
    }

    if (!Number.isInteger(entry.number) || entry.number < 1) {
      throw new Error(`entries[${index}].number must be a positive integer.`);
    }

    if (!Number.isInteger(entry.gateNo) || entry.gateNo < 1) {
      throw new Error(`entries[${index}].gateNo must be a positive integer.`);
    }

    if (seenHorseIds.has(horseId)) {
      throw new Error(`Duplicate horseId ${horseId}.`);
    }

    if (seenNumbers.has(entry.number)) {
      throw new Error(`Duplicate horse number ${entry.number}.`);
    }

    if (seenGateNos.has(entry.gateNo)) {
      throw new Error(`Duplicate gateNo ${entry.gateNo}.`);
    }

    seenHorseIds.add(horseId);
    seenNumbers.add(entry.number);
    seenGateNos.add(entry.gateNo);

    return {
      ...entry,
      horseId,
      name,
      silkColor,
    };
  }).slice(0, fieldSize);
}

function normalizeFieldSize(fieldSize: number) {
  if (!Number.isInteger(fieldSize) || fieldSize < 6 || fieldSize > 8) {
    throw new Error("Racing fieldSize must be an integer between 6 and 8.");
  }

  return fieldSize;
}

function normalizePositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return value;
}

function normalizePositiveNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }

  return value;
}

function sampleProfile(rngState: number) {
  let state = rngState;
  const startReaction = sampleCentered(state);
  state = startReaction.rngState;
  const earlyPace = sampleCentered(state);
  state = earlyPace.rngState;
  const midPace = sampleCentered(state);
  state = midPace.rngState;
  const turnHandling = sampleCentered(state);
  state = turnHandling.rngState;
  const lateKick = sampleCentered(state);
  state = lateKick.rngState;
  const stamina = sampleCentered(state);
  state = stamina.rngState;
  const volatility = sampleRange(state, 0.8, 1.2);
  state = volatility.rngState;

  return {
    rngState: state,
    profile: {
      startReaction: startReaction.value,
      earlyPace: earlyPace.value,
      midPace: midPace.value,
      turnHandling: turnHandling.value,
      lateKick: lateKick.value,
      stamina: stamina.value,
      volatility: volatility.value,
    },
  };
}

function sampleEventSchedule(rngState: number) {
  let state = rngState;
  const countResult = nextRandom(state);
  state = countResult.rngState;
  const eventCount = 1 + Math.floor(countResult.value * 3);
  const events: RacingScheduledEvent[] = [];

  for (let index = 0; index < eventCount; index += 1) {
    const templateResult = nextRandom(state);
    state = templateResult.rngState;
    const template =
      eventTemplates[
        Math.min(
          eventTemplates.length - 1,
          Math.floor(templateResult.value * eventTemplates.length),
        )
      ] ?? eventTemplates[0];
    const startResult = sampleRange(
      state,
      template.startProgressMin,
      template.startProgressMax,
    );
    state = startResult.rngState;
    const durationResult = sampleRange(
      state,
      template.durationMsMin,
      template.durationMsMax,
    );
    state = durationResult.rngState;

    events.push({
      type: template.type,
      startProgress: startResult.value,
      durationMs: Math.round(durationResult.value),
      targetPower: template.targetPower,
      startedAtMs: null,
    });
  }

  return {
    rngState: state,
    events: events.sort((left, right) => left.startProgress - right.startProgress),
  };
}

function updateEventState(
  horse: RacingHorseState,
  progress: number,
  elapsedMs: number,
  dt: number,
) {
  if (horse.currentEvent) {
    const eventElapsedMs = elapsedMs - horse.currentEvent.startedAtMs;

    if (eventElapsedMs <= horse.currentEvent.durationMs) {
      return {
        currentEvent: {
          ...horse.currentEvent,
          currentPower: moveToward(
            horse.currentEvent.currentPower,
            horse.currentEvent.targetPower,
            eventRampRatePerSecond * dt,
          ),
        },
        eventSchedule: horse.eventSchedule,
      };
    }

    const currentPower = moveToward(
      horse.currentEvent.currentPower,
      0,
      eventRampRatePerSecond * dt,
    );

    return {
      currentEvent:
        Math.abs(currentPower) > 0.05
          ? {
              ...horse.currentEvent,
              targetPower: 0,
              currentPower,
            }
          : null,
      eventSchedule: horse.eventSchedule,
    };
  }

  const eventIndex = horse.eventSchedule.findIndex(
    (event) => event.startedAtMs === null && progress >= event.startProgress,
  );

  if (eventIndex < 0) {
    return {
      currentEvent: null,
      eventSchedule: horse.eventSchedule,
    };
  }

  return {
    currentEvent: {
      type: horse.eventSchedule[eventIndex]?.type ?? "EARLY_PUSH",
      startedAtMs: elapsedMs,
      durationMs: horse.eventSchedule[eventIndex]?.durationMs ?? 2_000,
      targetPower: horse.eventSchedule[eventIndex]?.targetPower ?? 0,
      currentPower: 0,
    },
    eventSchedule: horse.eventSchedule.map((event, index) =>
      index === eventIndex ? { ...event, startedAtMs: elapsedMs } : event,
    ),
  };
}

function calculateTargetSpeed(input: {
  horse: RacingHorseState;
  progress: number;
  smoothNoise: number;
  eventModifier: number;
}) {
  const phaseProfileBonus = getPhaseProfileBonus(
    input.horse.profile,
    input.progress,
  );
  const smoothNoiseBonus = input.smoothNoise * 1.2;
  const packModifier = getPackModifier(input.horse, input.progress);
  const fatiguePenalty = getFatiguePenalty(input.horse, input.progress);

  return clamp(
    getBaseSpeedMps(input.progress) +
      phaseProfileBonus +
      smoothNoiseBonus +
      packModifier +
      input.eventModifier -
      fatiguePenalty,
    6,
    23,
  );
}

function getBaseSpeedMps(progress: number) {
  if (progress < 0.08) {
    return 14;
  }

  if (progress < 0.3) {
    return 18;
  }

  if (progress < 0.65) {
    return 17;
  }

  if (progress < 0.82) {
    return 16;
  }

  return 18.8;
}

function getPhaseProfileBonus(profile: RacingHorseProfile, progress: number) {
  if (progress < 0.08) {
    return profile.startReaction * 1.2;
  }

  if (progress < 0.3) {
    return profile.earlyPace * 0.9;
  }

  if (progress < 0.65) {
    return profile.midPace * 0.7 + profile.stamina * 0.2;
  }

  if (progress < 0.82) {
    return profile.turnHandling * 0.8 + profile.stamina * 0.2;
  }

  return profile.lateKick * 1.2 + profile.stamina * 0.5;
}

function getPackModifier(horse: RacingHorseState, progress: number) {
  if (progress <= 0.25 || progress >= 0.85) {
    return 0;
  }

  if (horse.rank === 1) {
    return -0.05;
  }

  if (horse.rank >= 5) {
    return 0.08;
  }

  return 0;
}

function getFatiguePenalty(horse: RacingHorseState, progress: number) {
  const fatigueMultiplier = progress < 0.65 ? 0.2 : progress < 0.82 ? 0.6 : 1.2;

  return clamp(
    horse.effort * 0.015 * fatigueMultiplier - horse.profile.stamina * 0.3,
    0,
    2.5,
  );
}

function estimateFinishedAtMs(input: {
  elapsedMs: number;
  previousPositionM: number;
  speedMps: number;
  distanceM: number;
}) {
  if (input.speedMps <= 0) {
    return input.elapsedMs;
  }

  const remainingM = Math.max(0, input.distanceM - input.previousPositionM);

  return Math.round(input.elapsedMs + (remainingM / input.speedMps) * 1000);
}

function assignRanks(horses: RacingHorseState[]) {
  return [...horses]
    .sort(compareRacePosition)
    .map((horse, index) => ({
      ...horse,
      rank: index + 1,
    }))
    .sort((left, right) => left.lane - right.lane);
}

function compareRacePosition(left: RacingHorseState, right: RacingHorseState) {
  if (left.finishedAtMs !== null && right.finishedAtMs !== null) {
    return left.finishedAtMs - right.finishedAtMs || left.tieBreaker - right.tieBreaker;
  }

  if (left.finishedAtMs !== null) {
    return -1;
  }

  if (right.finishedAtMs !== null) {
    return 1;
  }

  return right.positionM - left.positionM || left.tieBreaker - right.tieBreaker;
}

function getStateLabel(input: {
  currentEvent: RacingEventState | null;
  finishedAtMs: number | null;
  progress: number;
  speedMps: number;
}): RacingHorseStateLabel {
  if (input.finishedAtMs !== null) {
    return "FINISHED";
  }

  if (input.currentEvent?.type === "WIDE_TURN") {
    return "WIDE_TURN";
  }

  if (
    input.currentEvent?.type === "LATE_SURGE" ||
    input.currentEvent?.type === "CLEAR_LANE"
  ) {
    return "LATE_SURGE";
  }

  if (
    input.currentEvent?.type === "FADE" ||
    input.currentEvent?.type === "SLOW_BREAK"
  ) {
    return "FADING";
  }

  if (
    input.currentEvent?.type === "EARLY_PUSH" ||
    input.currentEvent?.type === "CLEAN_BREAK"
  ) {
    return "EARLY_PUSH";
  }

  if (input.progress < 0.08) {
    return "BREAK";
  }

  if (input.progress < 0.3) {
    return "EARLY_PUSH";
  }

  if (input.progress < 0.65) {
    return "CRUISING";
  }

  if (input.progress < 0.82) {
    return "CHASING";
  }

  return input.speedMps < 15 ? "FADING" : "LATE_SURGE";
}

function hashSeed(seed: string) {
  const normalizedSeed = seed.trim();

  if (!normalizedSeed) {
    throw new Error("seed is required.");
  }

  let hash = 2_166_136_261;

  for (let index = 0; index < normalizedSeed.length; index += 1) {
    hash ^= normalizedSeed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0 || 0x9e3779b9;
}

function nextRandom(rngState: number) {
  let state = rngState >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  state >>>= 0;

  if (state === 0) {
    state = 0x9e3779b9;
  }

  return {
    rngState: state,
    value: state / 0x100000000,
  };
}

function sampleCentered(rngState: number) {
  const result = nextRandom(rngState);

  return {
    rngState: result.rngState,
    value: result.value * 2 - 1,
  };
}

function sampleRange(rngState: number, min: number, max: number) {
  const result = nextRandom(rngState);

  return {
    rngState: result.rngState,
    value: min + (max - min) * result.value,
  };
}

function moveToward(current: number, target: number, maxDelta: number) {
  if (current < target) {
    return Math.min(target, current + maxDelta);
  }

  return Math.max(target, current - maxDelta);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const comfortableSpeedMps = 16.5;
const eventRampRatePerSecond = 2.4;

const eventTemplates: Array<{
  type: RacingEventType;
  startProgressMin: number;
  startProgressMax: number;
  durationMsMin: number;
  durationMsMax: number;
  targetPower: number;
}> = [
  {
    type: "CLEAN_BREAK",
    startProgressMin: 0.01,
    startProgressMax: 0.06,
    durationMsMin: 1_000,
    durationMsMax: 1_800,
    targetPower: 0.8,
  },
  {
    type: "SLOW_BREAK",
    startProgressMin: 0.01,
    startProgressMax: 0.06,
    durationMsMin: 1_000,
    durationMsMax: 1_800,
    targetPower: -0.8,
  },
  {
    type: "EARLY_PUSH",
    startProgressMin: 0.1,
    startProgressMax: 0.28,
    durationMsMin: 2_000,
    durationMsMax: 3_200,
    targetPower: 0.7,
  },
  {
    type: "SETTLE_BACK",
    startProgressMin: 0.12,
    startProgressMax: 0.55,
    durationMsMin: 2_000,
    durationMsMax: 3_500,
    targetPower: -0.3,
  },
  {
    type: "WIDE_TURN",
    startProgressMin: 0.66,
    startProgressMax: 0.8,
    durationMsMin: 1_500,
    durationMsMax: 2_800,
    targetPower: -0.7,
  },
  {
    type: "CLEAR_LANE",
    startProgressMin: 0.72,
    startProgressMax: 0.9,
    durationMsMin: 1_600,
    durationMsMax: 2_800,
    targetPower: 0.7,
  },
  {
    type: "LATE_SURGE",
    startProgressMin: 0.84,
    startProgressMax: 0.96,
    durationMsMin: 1_800,
    durationMsMax: 3_200,
    targetPower: 1,
  },
  {
    type: "FADE",
    startProgressMin: 0.84,
    startProgressMax: 0.96,
    durationMsMin: 1_800,
    durationMsMax: 3_200,
    targetPower: -1,
  },
];

const defaultSilkColors = [
  "#d32f2f",
  "#1976d2",
  "#fbc02d",
  "#388e3c",
  "#7b1fa2",
  "#f57c00",
  "#00796b",
  "#455a64",
];
