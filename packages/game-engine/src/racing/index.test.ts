import { describe, expect, it } from "vitest";
import {
  advanceRacingRaceTick,
  createRacingEntries,
  createRacingRace,
  racingEngineVersion,
  simulateRacingRace,
  type RacingRaceState,
} from "./index";

describe("racing engine package", () => {
  it("exposes the engine version", () => {
    expect(racingEngineVersion).toBe("racing-engine-v1");
  });

  it("creates a deterministic initial race state without selecting a winner", () => {
    const entries = createRacingEntries(6);
    const race = createRacingRace({ entries, seed: "race-seed-1" });

    expect(race.phase).toBe("RUNNING");
    expect(race.finishOrder).toEqual([]);
    expect(race.horses).toHaveLength(6);
    expect(race.horses.map((horse) => horse.finishedAtMs)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(race.horses.every((horse) => horse.profile.volatility >= 0.8)).toBe(
      true,
    );
  });

  it("advances race ticks without mutating the previous state", () => {
    const initial = createRacingRace({
      entries: createRacingEntries(6),
      seed: "tick-seed",
    });
    const next = advanceRacingRaceTick(initial);

    expect(next).not.toBe(initial);
    expect(initial.tick).toBe(0);
    expect(initial.elapsedMs).toBe(0);
    expect(initial.horses.every((horse) => horse.positionM === 0)).toBe(true);
    expect(next.tick).toBe(1);
    expect(next.elapsedMs).toBe(100);
    expect(next.horses.some((horse) => horse.positionM > 0)).toBe(true);
  });

  it("simulates a complete race with unique finish ranks", () => {
    const race = simulateRacingRace({
      entries: createRacingEntries(6),
      seed: "finish-seed",
    });

    expect(race.phase).toBe("FINISHED");
    expect(race.elapsedMs).toBeGreaterThanOrEqual(55_000);
    expect(race.elapsedMs).toBeLessThanOrEqual(75_000);
    expect(race.finishOrder).toHaveLength(6);
    expect(new Set(race.finishOrder).size).toBe(6);
    expect(race.horses.map((horse) => horse.rank).sort()).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(race.horses.every((horse) => horse.stateLabel === "FINISHED")).toBe(
      true,
    );
  });

  it("replays the same seed into the same result", () => {
    const input = {
      entries: createRacingEntries(8),
      seed: "replay-seed",
    };
    const first = raceReplaySummary(simulateRacingRace(input));
    const second = raceReplaySummary(simulateRacingRace(input));

    expect(second).toEqual(first);
  });

  it("produces varied winners from different seeds", () => {
    const winners = new Set<string>();

    for (let raceNo = 0; raceNo < 30; raceNo += 1) {
      const race = simulateRacingRace({
        entries: createRacingEntries(6),
        seed: `varied-winner:${raceNo}`,
        raceDistanceM: 300,
        tickIntervalMs: 200,
      });

      winners.add(race.finishOrder[0] ?? "");
    }

    expect(winners.size).toBeGreaterThan(1);
  });

  it("keeps equal starting probability within tolerance by field size", () => {
    for (const fieldSize of [6, 8]) {
      const sampleSize = 10_000;
      const counts = new Map<string, number>();

      for (const entry of createRacingEntries(fieldSize)) {
        counts.set(entry.horseId, 0);
      }

      for (let raceNo = 0; raceNo < sampleSize; raceNo += 1) {
        const race = simulateRacingRace({
          entries: createRacingEntries(fieldSize),
          seed: `fairness:${fieldSize}:${raceNo}`,
          raceDistanceM: 200,
          tickIntervalMs: 250,
        });
        const winner = race.finishOrder[0];

        if (!winner) {
          throw new Error("Expected every simulated race to have a winner.");
        }

        counts.set(winner, (counts.get(winner) ?? 0) + 1);
      }

      const expected = sampleSize / fieldSize;
      const tolerance = sampleSize * 0.02;

      for (const count of counts.values()) {
        expect(Math.abs(count - expected)).toBeLessThanOrEqual(tolerance);
      }
    }
  }, 30_000);
});

function raceReplaySummary(race: RacingRaceState) {
  return {
    elapsedMs: race.elapsedMs,
    finishOrder: race.finishOrder,
    horses: race.horses.map((horse) => ({
      horseId: horse.horseId,
      rank: horse.rank,
      finishedAtMs: horse.finishedAtMs,
      positionM: Number(horse.positionM.toFixed(4)),
      speedMps: Number(horse.speedMps.toFixed(4)),
    })),
  };
}
