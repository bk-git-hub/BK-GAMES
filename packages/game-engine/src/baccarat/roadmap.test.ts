import { describe, expect, it } from "vitest";
import {
  buildBaccaratBeadPlate,
  buildBaccaratBigRoad,
  buildBaccaratRoadmaps,
  type BaccaratRoadmapRound,
} from "./index";

describe("baccarat roadmap helpers", () => {
  it("generates Bead Plate cells in round chronology", () => {
    const beadPlate = buildBaccaratBeadPlate([
      round(3, "TIE"),
      round(1, "PLAYER", { playerTotal: 8, bankerTotal: 4, isNatural: true }),
      round(2, "BANKER", { playerTotal: 2, bankerTotal: 6 }),
      round(4, "PLAYER"),
      round(5, "BANKER"),
      round(6, "TIE"),
      round(7, "PLAYER"),
    ]);

    expect(
      beadPlate.map((cell) => ({
        roundNo: cell.roundNo,
        row: cell.row,
        col: cell.col,
        outcome: cell.outcome,
      })),
    ).toEqual([
      { roundNo: 1, row: 0, col: 0, outcome: "PLAYER" },
      { roundNo: 2, row: 1, col: 0, outcome: "BANKER" },
      { roundNo: 3, row: 2, col: 0, outcome: "TIE" },
      { roundNo: 4, row: 3, col: 0, outcome: "PLAYER" },
      { roundNo: 5, row: 4, col: 0, outcome: "BANKER" },
      { roundNo: 6, row: 5, col: 0, outcome: "TIE" },
      { roundNo: 7, row: 0, col: 1, outcome: "PLAYER" },
    ]);
    expect(beadPlate[0]).toMatchObject({
      playerTotal: 8,
      bankerTotal: 4,
      isNatural: true,
      totalCards: 4,
    });
  });

  it("builds basic Big Road streaks and keeps Tie as badge counts", () => {
    const { bigRoad, leadingTies } = buildBaccaratBigRoad([
      round(1, "TIE"),
      round(2, "TIE"),
      round(3, "PLAYER"),
      round(4, "TIE"),
      round(5, "PLAYER"),
      round(6, "BANKER"),
      round(7, "TIE"),
      round(8, "BANKER"),
      round(9, "PLAYER"),
    ]);

    expect(leadingTies.map((marker) => marker.roundNo)).toEqual([1, 2]);
    expect(
      bigRoad.map((cell) => ({
        roundNo: cell.roundNo,
        outcome: cell.outcome,
        row: cell.row,
        col: cell.col,
        tieCount: cell.tieCount,
      })),
    ).toEqual([
      { roundNo: 3, outcome: "PLAYER", row: 0, col: 0, tieCount: 1 },
      { roundNo: 5, outcome: "PLAYER", row: 1, col: 0, tieCount: 0 },
      { roundNo: 6, outcome: "BANKER", row: 0, col: 1, tieCount: 1 },
      { roundNo: 8, outcome: "BANKER", row: 1, col: 1, tieCount: 0 },
      { roundNo: 9, outcome: "PLAYER", row: 0, col: 2, tieCount: 0 },
    ]);
  });

  it("continues long Big Road streaks horizontally when the column is blocked", () => {
    const { bigRoad } = buildBaccaratBigRoad([
      round(1, "PLAYER"),
      round(2, "PLAYER"),
      round(3, "PLAYER"),
      round(4, "PLAYER"),
      round(5, "PLAYER"),
      round(6, "PLAYER"),
      round(7, "PLAYER"),
      round(8, "PLAYER"),
      round(9, "BANKER"),
      round(10, "BANKER"),
      round(11, "BANKER"),
      round(12, "BANKER"),
      round(13, "BANKER"),
      round(14, "BANKER"),
    ]);

    expect(
      bigRoad.map((cell) => ({
        roundNo: cell.roundNo,
        outcome: cell.outcome,
        row: cell.row,
        col: cell.col,
      })),
    ).toEqual([
      { roundNo: 1, outcome: "PLAYER", row: 0, col: 0 },
      { roundNo: 2, outcome: "PLAYER", row: 1, col: 0 },
      { roundNo: 3, outcome: "PLAYER", row: 2, col: 0 },
      { roundNo: 4, outcome: "PLAYER", row: 3, col: 0 },
      { roundNo: 5, outcome: "PLAYER", row: 4, col: 0 },
      { roundNo: 6, outcome: "PLAYER", row: 5, col: 0 },
      { roundNo: 7, outcome: "PLAYER", row: 5, col: 1 },
      { roundNo: 8, outcome: "PLAYER", row: 5, col: 2 },
      { roundNo: 9, outcome: "BANKER", row: 0, col: 1 },
      { roundNo: 10, outcome: "BANKER", row: 1, col: 1 },
      { roundNo: 11, outcome: "BANKER", row: 2, col: 1 },
      { roundNo: 12, outcome: "BANKER", row: 3, col: 1 },
      { roundNo: 13, outcome: "BANKER", row: 4, col: 1 },
      { roundNo: 14, outcome: "BANKER", row: 4, col: 2 },
    ]);
  });

  it("generates rebuildable snapshots from settled round history", () => {
    const history = [
      round(1, "PLAYER"),
      round(2, "BANKER"),
      round(3, "TIE"),
      round(4, "BANKER"),
    ];
    const firstSnapshot = buildBaccaratRoadmaps(history);
    const secondSnapshot = buildBaccaratRoadmaps(history);

    expect(secondSnapshot).toEqual(firstSnapshot);
    expect(firstSnapshot).toMatchObject({
      beadPlate: [
        { roundNo: 1, outcome: "PLAYER" },
        { roundNo: 2, outcome: "BANKER" },
        { roundNo: 3, outcome: "TIE" },
        { roundNo: 4, outcome: "BANKER" },
      ],
      bigRoad: [
        { roundNo: 1, outcome: "PLAYER", tieCount: 0 },
        { roundNo: 2, outcome: "BANKER", tieCount: 1 },
        { roundNo: 4, outcome: "BANKER", tieCount: 0 },
      ],
      leadingTies: [],
    });
  });
});

function round(
  roundNo: number,
  outcome: BaccaratRoadmapRound["outcome"],
  override: Partial<BaccaratRoadmapRound> = {},
): BaccaratRoadmapRound {
  return {
    roundId: `round-${roundNo}`,
    roundNo,
    outcome,
    playerTotal: outcome === "PLAYER" ? 8 : outcome === "BANKER" ? 3 : 6,
    bankerTotal: outcome === "BANKER" ? 8 : outcome === "PLAYER" ? 3 : 6,
    isNatural: false,
    totalCards: 4,
    ...override,
  };
}
