import type { BaccaratOutcome } from "./index.js";

export type BaccaratRoadmapRound = {
  roundId: string;
  roundNo: number;
  outcome: BaccaratOutcome;
  playerTotal: number;
  bankerTotal: number;
  isNatural: boolean;
  totalCards: number;
};

export type BaccaratRoadmapOptions = {
  rows?: number;
};

export type BaccaratBeadPlateCell = BaccaratRoadmapRound & {
  row: number;
  col: number;
};

export type BaccaratBigRoadOutcome = Exclude<BaccaratOutcome, "TIE">;

export type BaccaratBigRoadCell = Omit<BaccaratRoadmapRound, "outcome"> & {
  row: number;
  col: number;
  outcome: BaccaratBigRoadOutcome;
  tieCount: number;
};

export type BaccaratLeadingTieMarker = BaccaratRoadmapRound & {
  tieIndex: number;
};

export type BaccaratRoadmapSnapshot = {
  beadPlate: BaccaratBeadPlateCell[];
  bigRoad: BaccaratBigRoadCell[];
  leadingTies: BaccaratLeadingTieMarker[];
};

const defaultRoadmapRows = 6;

export function buildBaccaratRoadmaps(
  rounds: readonly BaccaratRoadmapRound[],
  options: BaccaratRoadmapOptions = {},
): BaccaratRoadmapSnapshot {
  const rows = normalizeRoadmapRows(options.rows);
  const sortedRounds = sortRoadmapRounds(rounds);

  return {
    beadPlate: buildBaccaratBeadPlate(sortedRounds, { rows }),
    ...buildBaccaratBigRoad(sortedRounds, { rows }),
  };
}

export function buildBaccaratBeadPlate(
  rounds: readonly BaccaratRoadmapRound[],
  options: BaccaratRoadmapOptions = {},
): BaccaratBeadPlateCell[] {
  const rows = normalizeRoadmapRows(options.rows);

  return sortRoadmapRounds(rounds).map((round, index) => ({
    ...round,
    row: index % rows,
    col: Math.floor(index / rows),
  }));
}

export function buildBaccaratBigRoad(
  rounds: readonly BaccaratRoadmapRound[],
  options: BaccaratRoadmapOptions = {},
): Pick<BaccaratRoadmapSnapshot, "bigRoad" | "leadingTies"> {
  const rows = normalizeRoadmapRows(options.rows);
  const bigRoad: BaccaratBigRoadCell[] = [];
  const leadingTies: BaccaratLeadingTieMarker[] = [];
  const occupied = new Set<string>();
  let currentCell: BaccaratBigRoadCell | null = null;
  let currentStreakStartCol = -1;

  for (const round of sortRoadmapRounds(rounds)) {
    if (round.outcome === "TIE") {
      if (currentCell) {
        currentCell.tieCount += 1;
      } else {
        leadingTies.push({
          ...round,
          tieIndex: leadingTies.length,
        });
      }

      continue;
    }

    const nextPosition =
      currentCell?.outcome === round.outcome
        ? getNextSameStreakPosition(currentCell, rows, occupied)
        : getNextNewStreakPosition(currentStreakStartCol, occupied);

    const cell: BaccaratBigRoadCell = {
      roundId: round.roundId,
      roundNo: round.roundNo,
      playerTotal: round.playerTotal,
      bankerTotal: round.bankerTotal,
      isNatural: round.isNatural,
      totalCards: round.totalCards,
      outcome: round.outcome,
      row: nextPosition.row,
      col: nextPosition.col,
      tieCount: 0,
    };

    if (currentCell?.outcome !== round.outcome) {
      currentStreakStartCol = cell.col;
    }

    bigRoad.push(cell);
    occupied.add(toGridKey(cell.row, cell.col));
    currentCell = cell;
  }

  return {
    bigRoad,
    leadingTies,
  };
}

function getNextSameStreakPosition(
  currentCell: BaccaratBigRoadCell,
  rows: number,
  occupied: ReadonlySet<string>,
) {
  const nextRow = currentCell.row + 1;

  if (nextRow < rows && !occupied.has(toGridKey(nextRow, currentCell.col))) {
    return {
      row: nextRow,
      col: currentCell.col,
    };
  }

  let nextCol = currentCell.col + 1;

  while (occupied.has(toGridKey(currentCell.row, nextCol))) {
    nextCol += 1;
  }

  return {
    row: currentCell.row,
    col: nextCol,
  };
}

function getNextNewStreakPosition(
  currentStreakStartCol: number,
  occupied: ReadonlySet<string>,
) {
  let nextCol = currentStreakStartCol + 1;

  while (occupied.has(toGridKey(0, nextCol))) {
    nextCol += 1;
  }

  return {
    row: 0,
    col: nextCol,
  };
}

function sortRoadmapRounds(rounds: readonly BaccaratRoadmapRound[]) {
  return rounds
    .map((round, index) => ({
      round: normalizeRoadmapRound(round),
      index,
    }))
    .sort(
      (left, right) =>
        left.round.roundNo - right.round.roundNo || left.index - right.index,
    )
    .map(({ round }) => round);
}

function normalizeRoadmapRound(
  round: BaccaratRoadmapRound,
): BaccaratRoadmapRound {
  const roundId = round.roundId.trim();

  if (!roundId) {
    throw new Error("roundId is required.");
  }

  if (!Number.isInteger(round.roundNo) || round.roundNo < 1) {
    throw new Error("roundNo must be a positive integer.");
  }

  assertBaccaratTotal(round.playerTotal, "playerTotal");
  assertBaccaratTotal(round.bankerTotal, "bankerTotal");

  if (!Number.isInteger(round.totalCards) || round.totalCards < 4) {
    throw new Error("totalCards must be an integer greater than or equal to 4.");
  }

  return {
    ...round,
    roundId,
  };
}

function normalizeRoadmapRows(rows: number | undefined) {
  if (rows === undefined) {
    return defaultRoadmapRows;
  }

  if (!Number.isInteger(rows) || rows < 1) {
    throw new Error("rows must be a positive integer.");
  }

  return rows;
}

function assertBaccaratTotal(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > 9) {
    throw new Error(`${label} must be an integer between 0 and 9.`);
  }
}

function toGridKey(row: number, col: number) {
  return `${row}:${col}`;
}
